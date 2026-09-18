import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { grant, inviteToken, user } from './db/schema';
import { hashToken, newId, randomToken } from './crypto';
import { publicOrigin } from './env';
import { nextUniqueColor, normalizeHexColor } from '../colors';

export function listReviewers() {
	return db.select().from(user).where(eq(user.role, 'reviewer')).all();
}

function assignedColor(requested: string | null | undefined, exceptId?: string) {
	const custom = requested ? normalizeHexColor(requested) : null;
	if (custom) return custom;
	const used = listReviewers()
		.filter((row) => row.id !== exceptId)
		.map((row) => row.highlightColor);
	return nextUniqueColor(used);
}

export function createReviewer(opts: { name: string; email: string; highlightColor?: string | null }) {
	const now = new Date();
	const id = newId();
	db.insert(user)
		.values({
			id,
			name: opts.name,
			email: opts.email.toLowerCase(),
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
	const base = `${origin}/invite/${token}`;
	return slug ? `${base}?document=${encodeURIComponent(slug)}` : base;
}

export function setGrant(reviewerId: string, documentId: string, visibilityScope = 'own') {
	const existing = db
		.select()
		.from(grant)
		.where(and(eq(grant.reviewerId, reviewerId), eq(grant.documentId, documentId)))
		.get();
	if (existing) {
		db.update(grant)
			.set({ visibilityScope })
			.where(and(eq(grant.reviewerId, reviewerId), eq(grant.documentId, documentId)))
			.run();
		return;
	}
	db.insert(grant)
		.values({
			reviewerId,
			documentId,
			visibilityScope,
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
	opts: { name: string; email: string; highlightColor?: string | null }
) {
	const row = db.select().from(user).where(eq(user.id, id)).get();
	if (!row || row.role !== 'reviewer') throw new Error('Reviewer not found');
	db.update(user)
		.set({
			name: opts.name,
			email: opts.email.toLowerCase(),
			highlightColor: assignedColor(opts.highlightColor, id),
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
