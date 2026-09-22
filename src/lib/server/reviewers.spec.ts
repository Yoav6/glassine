import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The database opens at import time from DATA_DIR, so point it at a scratch
// folder before importing anything that touches it.
describe('reviewers with an optional email', () => {
	let root: string;
	let db: typeof import('./db').db;
	let schema: typeof import('./db/schema');
	let createReviewer: typeof import('./reviewers').createReviewer;
	let updateReviewer: typeof import('./reviewers').updateReviewer;

	beforeAll(async () => {
		root = mkdtempSync(join(tmpdir(), 'glassine-reviewers-'));
		vi.stubEnv('DATA_DIR', root);
		vi.stubEnv('AUTHOR_EMAIL', 'author@example.com');
		vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');

		({ db } = await import('./db'));
		schema = await import('./db/schema');
		({ createReviewer, updateReviewer } = await import('./reviewers'));
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		rmSync(root, { recursive: true, force: true });
	});

	function emailOf(id: string) {
		return db.select().from(schema.user).where(eq(schema.user.id, id)).get()?.email;
	}

	it('creates a reviewer with no email when none is given', () => {
		const created = createReviewer({ name: 'No Email' });
		expect(emailOf(created.id)).toBeNull();
	});

	it('treats an empty or whitespace email the same as none', () => {
		const blank = createReviewer({ name: 'Blank', email: '' });
		expect(emailOf(blank.id)).toBeNull();
		const spaces = createReviewer({ name: 'Spaces', email: '   ' });
		expect(emailOf(spaces.id)).toBeNull();
	});

	it('does not collide two reviewers who both have no email', () => {
		// SQLite's UNIQUE allows any number of NULLs; this only fails if the
		// column is still NOT NULL or the unique index treats NULL as a value.
		expect(() => createReviewer({ name: 'First' })).not.toThrow();
		expect(() => createReviewer({ name: 'Second' })).not.toThrow();
	});

	it('still lowercases and stores a real email when one is given', () => {
		const created = createReviewer({ name: 'Has Email', email: 'Mixed.Case@Example.com' });
		expect(emailOf(created.id)).toBe('mixed.case@example.com');
	});

	it('lets an email be added later to a reviewer created without one', () => {
		const created = createReviewer({ name: 'Add Later' });
		expect(emailOf(created.id)).toBeNull();
		updateReviewer(created.id, { email: 'later@example.com' });
		expect(emailOf(created.id)).toBe('later@example.com');
	});

	it('lets an email be cleared back to none', () => {
		const created = createReviewer({ name: 'Clear Me', email: 'clear@example.com' });
		expect(emailOf(created.id)).toBe('clear@example.com');
		updateReviewer(created.id, { email: '' });
		expect(emailOf(created.id)).toBeNull();
	});

	it('leaves the email untouched when the update omits it entirely', () => {
		const created = createReviewer({ name: 'Untouched', email: 'keep@example.com' });
		updateReviewer(created.id, { name: 'Untouched (renamed)' });
		expect(emailOf(created.id)).toBe('keep@example.com');
	});
});
