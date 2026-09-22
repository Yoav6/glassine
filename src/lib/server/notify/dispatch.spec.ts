import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The database opens at import time from DATA_DIR, so point it at a scratch
// folder before importing anything that touches it.
describe('notification dispatch', () => {
	let root: string;
	let sent: { to: string; subject: string; text: string }[] = [];
	let failNext = 0;

	let db: typeof import('../db').db;
	let schema: typeof import('../db/schema');
	let tick: typeof import('./dispatch').tick;
	let setTransportForTests: typeof import('../mail').setTransportForTests;

	const MINUTE = 60_000;
	let authorId: string;
	let aliceId: string;
	let docId: string;

	beforeAll(async () => {
		root = mkdtempSync(join(tmpdir(), 'glassine-notify-'));
		vi.stubEnv('DATA_DIR', root);
		vi.stubEnv('AUTHOR_EMAIL', 'author@example.com');
		vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
		vi.stubEnv('SMTP_URL', 'smtp://localhost:1');
		vi.stubEnv('MAIL_FROM', 'Glassine <glassine@example.com>');
		// Pin pacing to the coded defaults the assertions below are built around,
		// regardless of whatever NOTIFY_* overrides a developer's own .env sets
		// for `npm run dev` (env.ts loads .env from cwd unconditionally).
		vi.stubEnv('NOTIFY_QUIET_MINUTES', '10');
		vi.stubEnv('NOTIFY_MAX_DELAY_MINUTES', '60');
		vi.stubEnv('NOTIFY_MIN_GAP_MINUTES', '5');

		({ db } = await import('../db'));
		schema = await import('../db/schema');
		({ tick } = await import('./dispatch'));
		({ setTransportForTests } = await import('../mail'));

		setTransportForTests({
			sendMail: async (message: { to: string; subject: string; text: string }) => {
				if (failNext > 0) {
					failNext -= 1;
					throw new Error('connection refused');
				}
				sent.push(message);
				return { messageId: 'test' };
			}
		} as never);

		const now = new Date();
		authorId = db.select().from(schema.user).get()!.id;
		aliceId = 'alice';
		db.insert(schema.user)
			.values({
				id: aliceId,
				name: 'Alice',
				email: 'alice@example.com',
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
				role: 'reviewer',
				highlightColor: '#c4b5fd'
			})
			.run();
		docId = 'doc1';
		db.insert(schema.document)
			.values({
				id: docId,
				slug: 'chapter-3',
				title: 'Chapter 3',
				relativePath: 'chapter-3.md',
				baseVersion: 1,
				updatedAt: now,
				createdAt: now
			})
			.run();
	});

	afterAll(() => {
		setTransportForTests(null);
		vi.unstubAllEnvs();
		rmSync(root, { recursive: true, force: true });
	});

	beforeEach(() => {
		sent = [];
		failNext = 0;
		db.delete(schema.notification).run();
		db.delete(schema.notificationState).run();
		db.delete(schema.annotation).run();
	});

	function annotate(id: string, over: Partial<typeof schema.annotation.$inferInsert> = {}) {
		const now = new Date();
		db.insert(schema.annotation)
			.values({
				id,
				documentId: docId,
				authorId: aliceId,
				type: 'comment',
				parentId: null,
				body: `body of ${id}`,
				replacement: null,
				exact: `quoted ${id}`,
				prefix: '',
				suffix: '',
				offsetHint: 0,
				headingPath: '',
				paraOrdinal: 0,
				visibility: 'own',
				status: 'open',
				detached: false,
				baseVersionSeen: 1,
				createdAt: now,
				updatedAt: now,
				...over
			})
			.run();
		return id;
	}

	function notify(kind: string, createdAt: number, annotationId: string | null = null) {
		const id = `n-${kind}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
		db.insert(schema.notification)
			.values({
				id,
				userId: authorId,
				actorId: aliceId,
				kind,
				documentId: docId,
				annotationId,
				threadId: null,
				createdAt: new Date(createdAt),
				readAt: null,
				emailStatus: null,
				emailedAt: null
			})
			.run();
		return id;
	}

	function statusOf(id: string) {
		return db
			.select()
			.from(schema.notification)
			.where(eq(schema.notification.id, id))
			.get()?.emailStatus;
	}

	it('collapses a whole review session into one email', async () => {
		for (let i = 0; i < 20; i += 1) notify('suggestion', i * 30_000, annotate(`s${i}`));
		for (let i = 0; i < 6; i += 1) notify('comment', i * 30_000, annotate(`c${i}`));

		// Still inside the quiet window: nothing goes out.
		await tick(10 * MINUTE);
		expect(sent).toHaveLength(0);

		await tick(25 * MINUTE);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('author@example.com');
		expect(sent[0].subject).toContain('Alice');
	});

	it('does not email what the recipient already read in the app', async () => {
		const id = notify('reply', 0, annotate('a1'));
		db.update(schema.notification)
			.set({ readAt: new Date(60_000) })
			.where(eq(schema.notification.id, id))
			.run();

		await tick(30 * MINUTE);
		expect(sent).toHaveLength(0);
		expect(statusOf(id)).toBe('read');
	});

	it('never sends on passenger kinds alone, but carries them once a reply fires', async () => {
		const accepted = notify('accepted', 0, annotate('a1', { type: 'suggestion', replacement: 'x' }));
		const resolved = notify('resolved', 0, annotate('a2'));

		await tick(30 * MINUTE);
		expect(sent).toHaveLength(0);
		expect(statusOf(accepted)).toBeNull();

		notify('reply', 31 * MINUTE, annotate('a3'));
		await tick(45 * MINUTE);
		expect(sent).toHaveLength(1);
		expect(sent[0].text).toContain('Also since your last email');
		expect(sent[0].text).toContain('1 suggestion accepted');
		expect(sent[0].text).toContain('1 thread resolved');
		expect(statusOf(accepted)).toBe('sent');
		expect(statusOf(resolved)).toBe('sent');
	});

	it('retries a failed send with backoff and keeps the rows queued', async () => {
		const id = notify('reply', 0, annotate('a1'));
		failNext = 1;

		await tick(30 * MINUTE);
		expect(sent).toHaveLength(0);
		expect(statusOf(id)).toBeNull();

		const state = db.select().from(schema.notificationState).get();
		expect(state?.attempts).toBe(1);
		expect(state?.nextAttemptAt?.getTime()).toBeGreaterThan(30 * MINUTE);

		// Too soon: still backing off.
		await tick(30 * MINUTE + 1000);
		expect(sent).toHaveLength(0);

		await tick(35 * MINUTE);
		expect(sent).toHaveLength(1);
		expect(statusOf(id)).toBe('sent');
		expect(db.select().from(schema.notificationState).get()?.attempts).toBe(0);
	});

	it('closes out a backlog too old to be worth mailing', async () => {
		const id = notify('reply', 0, annotate('a1'));
		await tick(48 * 60 * MINUTE);
		expect(sent).toHaveLength(0);
		expect(statusOf(id)).toBe('stale');
	});

	it('skips sending for a reviewer with no email, but keeps everything ready for when one is added', async () => {
		const now = new Date();
		const bobId = 'bob-no-email';
		db.insert(schema.user)
			.values({
				id: bobId,
				name: 'Bob',
				email: null,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
				role: 'reviewer',
				highlightColor: '#ffb37c'
			})
			.run();

		const replyId = `n-reply-bob-${Math.random().toString(36).slice(2, 8)}`;
		db.insert(schema.notification)
			.values({
				id: replyId,
				userId: bobId,
				actorId: authorId,
				kind: 'reply',
				documentId: docId,
				annotationId: annotate('bob-a1'),
				threadId: null,
				createdAt: new Date(0),
				readAt: null,
				emailStatus: null,
				emailedAt: null
			})
			.run();

		// Past the quiet window and the max delay: this would normally send.
		await tick(30 * MINUTE);
		expect(sent).toHaveLength(0);
		// Still queued, not dropped, not marked failed or stale — genuinely
		// prepared and waiting, not given up on.
		expect(statusOf(replyId)).toBeNull();
		// Not treated as a failed send either: no backoff/attempts were recorded
		// for a condition that isn't going to change on its own by retrying
		// sooner — a real send failure would have bumped attempts and set
		// nextAttemptAt (see the retry test above).
		const bobState = db
			.select()
			.from(schema.notificationState)
			.where(eq(schema.notificationState.userId, bobId))
			.get();
		expect(bobState?.attempts).toBe(0);
		expect(bobState?.nextAttemptAt).toBeNull();

		// Add an email later — the same queued notification goes out on the
		// very next tick, through the ordinary pacing rules, no special step.
		db.update(schema.user).set({ email: 'bob@example.com' }).where(eq(schema.user.id, bobId)).run();
		await tick(31 * MINUTE);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('bob@example.com');
		expect(statusOf(replyId)).toBe('sent');
	});
});
