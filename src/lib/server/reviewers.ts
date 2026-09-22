import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { grant, inviteToken, user } from './db/schema';
import { hashToken, newId, randomToken } from './crypto';
import { publicOrigin } from './env';
import { nextUniqueColor, normalizeHexColor } from '../colors';
import { parseScope, serializeScope } from '../access';

export function listReviewers() {
	return db.select().from(user).where(eq(user.role, 'reviewer')).all();
}

export function listAuthors() {
	return db.select().from(user).where(eq(user.role, 'author')).all();
}

/**
 * Renames the author account's login/recovery address. Not exposed in
 * `/admin/settings` on purpose: that address is also the account-recovery
 * target (`author-setup-link`, email OTP), so changing it is a break-glass
 * operation done from the server, not a self-serve web field a hijacked
 * session could redirect. Identifies the row by its current email since an
 * instance may seed more than one author over time.
 */
export function setAuthorEmail(currentEmail: string, nextEmail: string): { id: string } {
	const current = currentEmail.trim().toLowerCase();
	const next = nextEmail.trim().toLowerCase();
	if (!next) throw new Error('New email is required');
	if (!next.includes('@')) throw new Error(`"${next}" does not look like an email address`);
	const row = db
		.select()
		.from(user)
		.where(and(eq(user.email, current), eq(user.role, 'author')))
		.get();
	if (!row) {
		const authors = listAuthors().map((a) => a.email);
		throw new Error(
			authors.length
				? `No author found with email "${current}". Current author account(s): ${authors.join(', ')}.`
				: `No author found with email "${current}", and no author is seeded at all yet.`
		);
	}
	if (row.email === next) throw new Error(`${next} is already this author's email — nothing to do.`);
	const clash = db.select().from(user).where(eq(user.email, next)).get();
	if (clash) {
		throw new Error(
			`${next} is already in use by another account (role: ${clash.role}, name: "${clash.name}", id: ${clash.id}). ` +
				(clash.role === 'reviewer'
					? 'Delete or rename that reviewer first (Admin → Reviewers), or pick a different address.'
					: 'Pick a different address.')
		);
	}
	db.update(user).set({ email: next, updatedAt: new Date() }).where(eq(user.id, row.id)).run();
	return { id: row.id };
}

/** Stored annotation scope of every reviewer with a grant on the document. */
export function grantScopes(documentId: string): Record<string, string> {
	return Object.fromEntries(
		db
			.select({ reviewerId: grant.reviewerId, visibilityScope: grant.visibilityScope })
			.from(grant)
			.where(eq(grant.documentId, documentId))
			.all()
			.map((row) => [row.reviewerId, row.visibilityScope])
	);
}

/** Last Custom selection of every reviewer with a grant, kept while the grant is on Default. */
export function grantCustomScopes(documentId: string): Record<string, string> {
	return Object.fromEntries(
		db
			.select({ reviewerId: grant.reviewerId, customScope: grant.customScope })
			.from(grant)
			.where(eq(grant.documentId, documentId))
			.all()
			.flatMap((row) => (row.customScope ? [[row.reviewerId, row.customScope]] : []))
	);
}

export function grantedReviewerIds(documentId: string): string[] {
	return db
		.select({ reviewerId: grant.reviewerId })
		.from(grant)
		.where(eq(grant.documentId, documentId))
		.all()
		.map((row) => row.reviewerId);
}

function assignedColor(requested: string | null | undefined, exceptId?: string) {
	const custom = requested ? normalizeHexColor(requested) : null;
	if (custom) return custom;
	const used = listReviewers()
		.filter((row) => row.id !== exceptId)
		.map((row) => row.highlightColor);
	return nextUniqueColor(used);
}

/**
 * A reviewer's email is optional — some collaborators genuinely don't have one
 * you can reach, or you don't have it yet. Everything about notifications
 * still runs for them: recipient selection, in-app bell rows, the outbox.
 * Only the email *send* step checks for an address and skips if there isn't
 * one (`src/lib/server/notify/dispatch.ts`), so adding an email later picks
 * up right where it left off rather than needing anything re-enabled.
 */
export function createReviewer(opts: {
	name: string;
	email?: string | null;
	highlightColor?: string | null;
}) {
	const now = new Date();
	const id = newId();
	const email = opts.email?.trim();
	db.insert(user)
		.values({
			id,
			name: opts.name,
			email: email ? email.toLowerCase() : null,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
			role: 'reviewer',
			highlightColor: assignedColor(opts.highlightColor)
		})
		.run();
	const token = randomToken();
	db.insert(inviteToken)
		.values({
			id: newId(),
			reviewerId: id,
			tokenHash: hashToken(token),
			kind: 'reviewer',
			createdAt: now
		})
		.run();
	return { id, token };
}

export function rotateInvite(reviewerId: string): string {
	const now = new Date();
	db.update(inviteToken)
		.set({ revokedAt: now, rotatedAt: now })
		.where(and(eq(inviteToken.reviewerId, reviewerId), eq(inviteToken.kind, 'reviewer')))
		.run();
	const token = randomToken();
	db.insert(inviteToken)
		.values({
			id: newId(),
			reviewerId,
			tokenHash: hashToken(token),
			kind: 'reviewer',
			createdAt: now
		})
		.run();
	return token;
}

export function inviteUrl(token: string, slug?: string): string {
	const origin = publicOrigin();
	const q = `token=${encodeURIComponent(token)}`;
	if (slug) return `${origin}/documents/${encodeURIComponent(slug)}?${q}`;
	return `${origin}/?${q}`;
}

/** Canonical form of a submitted scope; custom picks are limited to people who exist. */
export function normalizeScope(raw: string): string {
	const scope = parseScope(raw);
	if (scope.kind !== 'custom') return serializeScope(scope);
	const known = new Set(db.select({ id: user.id }).from(user).all().map((row) => row.id));
	return serializeScope({ kind: 'custom', ids: scope.ids.filter((id) => known.has(id)) });
}

export function setGrant(reviewerId: string, documentId: string, requestedScope = 'default') {
	const visibilityScope = normalizeScope(requestedScope);
	// Switching to Default keeps the previous Custom selection; only a new Custom choice replaces it.
	const remembered = parseScope(visibilityScope).kind === 'default' ? {} : { customScope: visibilityScope };
	const existing = db
		.select()
		.from(grant)
		.where(and(eq(grant.reviewerId, reviewerId), eq(grant.documentId, documentId)))
		.get();
	if (existing) {
		db.update(grant)
			.set({ visibilityScope, ...remembered })
			.where(and(eq(grant.reviewerId, reviewerId), eq(grant.documentId, documentId)))
			.run();
		return;
	}
	db.insert(grant)
		.values({
			reviewerId,
			documentId,
			visibilityScope,
			customScope: remembered.customScope ?? null,
			createdAt: new Date()
		})
		.run();
}

export function revokeGrant(reviewerId: string, documentId: string) {
	db.delete(grant)
		.where(and(eq(grant.reviewerId, reviewerId), eq(grant.documentId, documentId)))
		.run();
}

export function updateReviewer(
	id: string,
	opts: { name?: string; email?: string | null; highlightColor?: string | null }
) {
	const row = db.select().from(user).where(eq(user.id, id)).get();
	if (!row || row.role !== 'reviewer') throw new Error('Reviewer not found');
	const name = opts.name?.trim();
	const highlightColor = opts.highlightColor ? normalizeHexColor(opts.highlightColor) : null;
	db.update(user)
		.set({
			...(name ? { name } : {}),
			// `undefined` leaves the email untouched. An explicit empty string or
			// null clears it — a reviewer can lose their only reachable address,
			// same as they can gain one later. Anything else sets it, lowercased.
			...(opts.email !== undefined
				? { email: opts.email?.trim() ? opts.email.trim().toLowerCase() : null }
				: {}),
			...(highlightColor ? { highlightColor } : {}),
			updatedAt: new Date()
		})
		.where(eq(user.id, id))
		.run();
}

export function deleteReviewer(id: string) {
	const row = db.select().from(user).where(eq(user.id, id)).get();
	if (!row || row.role !== 'reviewer') throw new Error('Reviewer not found');
	db.delete(user).where(eq(user.id, id)).run();
}

export function mintAuthorSetupLink(authorId: string): string {
	const now = new Date();
	db.update(inviteToken)
		.set({ revokedAt: now })
		.where(and(eq(inviteToken.reviewerId, authorId), eq(inviteToken.kind, 'author-setup')))
		.run();
	const token = randomToken();
	db.insert(inviteToken)
		.values({
			id: newId(),
			reviewerId: authorId,
			tokenHash: hashToken(token),
			kind: 'author-setup',
			expiresAt: new Date(Date.now() + 1000 * 60 * 30),
			createdAt: now
		})
		.run();
	return `${publicOrigin()}/setup?token=${encodeURIComponent(token)}`;
}

export { hashToken, randomToken };
