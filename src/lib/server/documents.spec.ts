import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The database opens at import time from DATA_DIR, so point it at a scratch
// folder before importing anything that touches it.
describe('createDocumentFromUpload with the git adapter on', () => {
	let root: string;
	let bare: string;
	let authorId: string;
	let createDocumentFromUpload: typeof import('./documents').createDocumentFromUpload;

	beforeAll(async () => {
		root = mkdtempSync(join(tmpdir(), 'glassine-docs-'));
		bare = join(root, 'git', 'glassine.git');
		mkdirSync(join(root, 'git'), { recursive: true });
		git(root, 'init', '--bare', '-q', '-b', 'main', bare);
		vi.stubEnv('DATA_DIR', root);
		vi.stubEnv('AUTHOR_EMAIL', 'author@example.com');
		vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
		vi.stubEnv('GIT_SYNC_SECRET', 'test-secret');
		// db/index.ts creates root/documents; cloning into an empty folder is fine.
		({ createDocumentFromUpload } = await import('./documents'));
		git(root, 'clone', '-q', bare, join(root, 'documents'));
		const { db } = await import('./db');
		const { user } = await import('./db/schema');
		authorId = db.select().from(user).get()!.id;
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		rmSync(root, { recursive: true, force: true });
	});

	it('commits and pushes an uploaded document', async () => {
		const doc = await createDocumentFromUpload('note.md', '# Note\n', authorId);
		expect(git(bare, 'log', '--format=%s', 'main')).toContain(`upload: ${doc.slug} v1`);
		expect(git(bare, 'show', 'main:note.md')).toBe('# Note');
	});

	it('commits a blank document made from a file name', async () => {
		await createDocumentFromUpload('blank.md', '', authorId);
		expect(git(bare, 'ls-tree', '-r', '--name-only', 'main').split('\n')).toContain('blank.md');
	});

	it('leaves git alone when the adapter is off', async () => {
		vi.stubEnv('GIT_SYNC_SECRET', '');
		try {
			await createDocumentFromUpload('quiet.md', '# Quiet\n', authorId);
			expect(existsSync(join(root, 'documents', 'quiet.md'))).toBe(true);
			// Still untracked in the working clone: nothing was added or committed.
			expect(git(join(root, 'documents'), 'status', '--short')).toContain('?? quiet.md');
		} finally {
			vi.stubEnv('GIT_SYNC_SECRET', 'test-secret');
		}
	});
});
