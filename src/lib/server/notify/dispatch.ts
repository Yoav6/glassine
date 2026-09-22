import { and, eq, inArray, isNull } from 'drizzle-orm';
import { backoffMs, isTriggering, planDigest, MAX_ATTEMPTS } from '$lib/notify';
import { db } from '../db';
import { annotation, document, notification, notificationState, user } from '../db/schema';
import { newId } from '../crypto';
import {
	domain,
	mailEnabled,
	notifyMaxDelayMs,
	notifyMinGapMs,
	notifyQuietMs,
	publicOrigin
} from '../env';
import { sendMail } from '../mail';
import { composeDigest, type DigestEntry } from './compose';

const STALE_MS = 24 * 60 * 60_000;
const TICK_MS = 60_000;

function config() {
	return {
		quietMs: notifyQuietMs(),
		maxDelayMs: notifyMaxDelayMs(),
		minGapMs: notifyMinGapMs(),
		staleMs: STALE_MS
	};
}

function close(ids: string[], status: 'read' | 'stale' | 'sent' | 'failed') {
	if (ids.length === 0) return;
	db.update(notification)
		.set({ emailStatus: status, emailedAt: new Date() })
		.where(inArray(notification.id, ids))
		.run();
}

function stateFor(userId: string) {
	const row = db
		.select()
		.from(notificationState)
		.where(eq(notificationState.userId, userId))
		.get();
	if (row) return row;
	db.insert(notificationState).values({ userId, attempts: 0 }).run();
	return db.select().from(notificationState).where(eq(notificationState.userId, userId)).get()!;
}

function pendingFor(userId: string) {
	return db
		.select({
			id: notification.id,
			kind: notification.kind,
			createdAt: notification.createdAt,
			readAt: notification.readAt,
			annotationId: notification.annotationId,
			threadId: notification.threadId,
			actorName: user.name,
			documentSlug: document.slug,
			documentTitle: document.title
		})
		.from(notification)
		.leftJoin(user, eq(notification.actorId, user.id))
		.innerJoin(document, eq(notification.documentId, document.id))
		.where(and(eq(notification.userId, userId), isNull(notification.emailStatus)))
		.all();
}

type PendingJoin = ReturnType<typeof pendingFor>[number];

/** Fills in the quoted passage and the written text the email shows. */
function toEntry(row: PendingJoin): DigestEntry {
	const source = row.annotationId
		? db.select().from(annotation).where(eq(annotation.id, row.annotationId)).get()
		: undefined;
	return {
		id: row.id,
		kind: row.kind,
		actorName: row.actorName ?? 'Someone',
		documentSlug: row.documentSlug,
		documentTitle: row.documentTitle,
		annotationId: row.annotationId,
		threadId: row.threadId,
		quote: source?.exact ?? null,
		body: source?.body ?? source?.replacement ?? null
	};
}

async function processUser(userId: string, now: number) {
	const state = stateFor(userId);
	const rows = pendingFor(userId);
	if (rows.length === 0) return;

	const plan = planDigest(
		now,
		rows.map((row) => ({
			id: row.id,
			kind: row.kind,
			createdAt: row.createdAt.getTime(),
			readAt: row.readAt?.getTime() ?? null
		})),
		{
			lastEmailAt: state.lastEmailAt?.getTime() ?? null,
			nextAttemptAt: state.nextAttemptAt?.getTime() ?? null
		},
		config()
	);

	close(plan.markRead, 'read');
	close(plan.markStale, 'stale');
	if (plan.send.length === 0) return;

	const recipient = db.select().from(user).where(eq(user.id, userId)).get();
	// A reviewer may not have an email. Everything up to here still ran in full
	// — the plan is computed, read/stale rows are closed out — only the send
	// itself is skipped. The `plan.send` rows are left queued (emailStatus
	// stays NULL), so adding an email later picks up on the very next tick,
	// through the same quiet-window pacing as any other digest.
	if (!recipient?.email) return;

	const sending = new Set(plan.send);
	const entries = rows.filter((row) => sending.has(row.id)).map(toEntry);
	// The dispatcher never mails a batch with nothing to announce.
	if (!entries.some((entry) => isTriggering(entry.kind))) return;

	const mail = composeDigest(entries, {
		origin: publicOrigin(),
		domain: domain(),
		batchId: newId()
	});

	try {
		await sendMail({ to: recipient.email, ...mail });
		close(plan.send, 'sent');
		db.update(notificationState)
			.set({ lastEmailAt: new Date(now), attempts: 0, nextAttemptAt: null, lastError: null })
			.where(eq(notificationState.userId, userId))
			.run();
	} catch (err) {
		const attempts = state.attempts + 1;
		const message = err instanceof Error ? err.message : 'send failed';
		if (attempts >= MAX_ATTEMPTS) {
			// Give up rather than let a dead SMTP config wedge the outbox forever.
			// The notifications stay in the bell; only the email is abandoned.
			console.error(
				`[notify] giving up on email to ${recipient.email} after ${attempts} attempts: ${message}`
			);
			close(plan.send, 'failed');
			db.update(notificationState)
				.set({ attempts: 0, nextAttemptAt: null, lastError: message })
				.where(eq(notificationState.userId, userId))
				.run();
			return;
		}
		console.warn(`[notify] email to ${recipient.email} failed (attempt ${attempts}): ${message}`);
		db.update(notificationState)
			.set({
				attempts,
				nextAttemptAt: new Date(now + backoffMs(attempts)),
				lastError: message
			})
			.where(eq(notificationState.userId, userId))
			.run();
	}
}

/** One pass over everyone with something waiting. Exported for tests. */
export async function tick(now = Date.now()) {
	const userIds = [
		...new Set(
			db
				.select({ userId: notification.userId })
				.from(notification)
				.where(isNull(notification.emailStatus))
				.all()
				.map((row) => row.userId)
		)
	];
	for (const userId of userIds) {
		try {
			await processUser(userId, now);
		} catch (err) {
			console.error('[notify] dispatch failed for', userId, err);
		}
	}
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the single background ticker. Safe to call repeatedly: Vite restarts
 * this module on every edit in dev. Unref'd so the CLI and vitest still exit.
 */
export function startDispatcher() {
	if (timer || !mailEnabled()) return;
	timer = setInterval(() => {
		void tick();
	}, TICK_MS);
	timer.unref?.();
}
