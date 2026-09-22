import { describe, it, expect } from 'vitest';
import { backoffMs, isTriggering, planDigest, selectRecipients, type PendingRow } from './notify';

const author = { id: 'author', role: 'author' };
const alice = { id: 'alice', role: 'reviewer' };
const bob = { id: 'bob', role: 'reviewer' };
const everyone = [author, alice, bob];

describe('selectRecipients', () => {
	it('never notifies the actor of their own action', () => {
		expect(
			selectRecipients({ candidates: [author, alice], actorId: 'alice', grants: { alice: 'default' }, everyone })
		).toEqual(['author']);
	});

	it('always notifies an author, who sees everything', () => {
		expect(
			selectRecipients({ candidates: [author], actorId: 'bob', grants: {}, everyone })
		).toEqual(['author']);
	});

	it('does not tell a default-scope reviewer about another reviewer', () => {
		// Alice is in the thread but her scope hides Bob, so Bob's reply must not
		// reach her — the notification would leak his participation.
		expect(
			selectRecipients({ candidates: [alice], actorId: 'bob', grants: { alice: 'default' }, everyone })
		).toEqual([]);
	});

	it('does tell a default-scope reviewer about the author', () => {
		expect(
			selectRecipients({ candidates: [alice], actorId: 'author', grants: { alice: 'default' }, everyone })
		).toEqual(['alice']);
	});

	it('tells an all-scope reviewer about another reviewer', () => {
		expect(
			selectRecipients({ candidates: [alice], actorId: 'bob', grants: { alice: 'all' }, everyone })
		).toEqual(['alice']);
	});

	it('honours a custom scope that names the actor, and one that does not', () => {
		expect(
			selectRecipients({ candidates: [alice], actorId: 'bob', grants: { alice: 'custom:bob' }, everyone })
		).toEqual(['alice']);
		expect(
			selectRecipients({ candidates: [alice], actorId: 'bob', grants: { alice: 'custom:author' }, everyone })
		).toEqual([]);
	});

	it('never notifies a reviewer with no grant on the document', () => {
		expect(
			selectRecipients({ candidates: [alice], actorId: 'author', grants: {}, everyone })
		).toEqual([]);
	});

	it('deduplicates a candidate listed twice', () => {
		expect(
			selectRecipients({ candidates: [author, author], actorId: 'alice', grants: {}, everyone })
		).toEqual(['author']);
	});
});

const config = { quietMs: 10 * 60_000, maxDelayMs: 60 * 60_000, minGapMs: 5 * 60_000, staleMs: 24 * 60 * 60_000 };
const idle = { lastEmailAt: null, nextAttemptAt: null };
const row = (over: Partial<PendingRow> & { id: string }): PendingRow => ({
	kind: 'reply',
	createdAt: 0,
	readAt: null,
	...over
});

describe('planDigest', () => {
	it('waits while the actor is still working', () => {
		const now = 5 * 60_000;
		const plan = planDigest(now, [row({ id: 'a', createdAt: 0 }), row({ id: 'b', createdAt: 4 * 60_000 })], idle, config);
		expect(plan.send).toEqual([]);
	});

	it('sends one digest covering the whole burst once they go quiet', () => {
		const pending = [
			row({ id: 'a', kind: 'suggestion', createdAt: 0 }),
			row({ id: 'b', kind: 'suggestion', createdAt: 2 * 60_000 }),
			row({ id: 'c', kind: 'comment', createdAt: 12 * 60_000 })
		];
		const plan = planDigest(23 * 60_000, pending, idle, config);
		expect(plan.send).toEqual(['a', 'b', 'c']);
	});

	it('sends at the max-delay cap even while the actor keeps working', () => {
		const now = 61 * 60_000;
		const pending = [row({ id: 'a', createdAt: 0 }), row({ id: 'b', createdAt: now - 60_000 })];
		expect(planDigest(now, pending, idle, config).send).toEqual(['a', 'b']);
	});

	it('sends nothing when only passenger kinds are pending', () => {
		const pending = [
			row({ id: 'a', kind: 'accepted', createdAt: 0 }),
			row({ id: 'b', kind: 'resolved', createdAt: 0 }),
			row({ id: 'c', kind: 'rejected', createdAt: 0 })
		];
		expect(planDigest(60 * 60_000, pending, idle, config).send).toEqual([]);
	});

	it('carries pending passengers along once a trigger fires', () => {
		const pending = [
			row({ id: 'a', kind: 'accepted', createdAt: 0 }),
			row({ id: 'b', kind: 'reply', createdAt: 60_000 })
		];
		expect(planDigest(30 * 60_000, pending, idle, config).send).toEqual(['a', 'b']);
	});

	it('drops what the recipient already read, and sends nothing if that was the only trigger', () => {
		const pending = [row({ id: 'a', createdAt: 0, readAt: 60_000 })];
		const plan = planDigest(30 * 60_000, pending, idle, config);
		expect(plan.markRead).toEqual(['a']);
		expect(plan.send).toEqual([]);
	});

	it('honours the minimum gap between emails', () => {
		const now = 30 * 60_000;
		const pending = [row({ id: 'a', createdAt: 0 })];
		expect(planDigest(now, pending, { lastEmailAt: now - 60_000, nextAttemptAt: null }, config).send).toEqual([]);
		expect(planDigest(now, pending, { lastEmailAt: now - 6 * 60_000, nextAttemptAt: null }, config).send).toEqual(['a']);
	});

	it('closes out rows too old to be worth mailing', () => {
		const now = 48 * 60 * 60_000;
		const plan = planDigest(now, [row({ id: 'old', createdAt: 0 })], idle, config);
		expect(plan.markStale).toEqual(['old']);
		expect(plan.send).toEqual([]);
	});

	it('leaves a failed batch untouched until its backoff expires', () => {
		const now = 30 * 60_000;
		const pending = [row({ id: 'a', createdAt: 0, readAt: 1 })];
		const plan = planDigest(now, pending, { lastEmailAt: null, nextAttemptAt: now + 60_000 }, config);
		expect(plan).toEqual({ send: [], markRead: [], markStale: [] });
	});
});

describe('isTriggering and backoffMs', () => {
	it('classifies kinds', () => {
		expect(['comment', 'suggestion', 'reply'].every(isTriggering)).toBe(true);
		expect(['accepted', 'rejected', 'resolved'].some(isTriggering)).toBe(false);
	});

	it('grows and caps', () => {
		expect(backoffMs(1)).toBe(60_000);
		expect(backoffMs(3)).toBe(4 * 60_000);
		expect(backoffMs(20)).toBe(2 * 60 * 60_000);
	});
});
