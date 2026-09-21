import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitPull, maybeGitCommit } from './git';

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

describe('maybeGitCommit', () => {
	let root: string;
	let bare: string;
	let documents: string;
	let hookRan: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'glassine-git-'));
		bare = join(root, 'git', 'glassine.git');
		documents = join(root, 'documents');
		hookRan = join(root, 'hook-ran');
		mkdirSync(join(root, 'git'), { recursive: true });
		git(root, 'init', '--bare', '-q', '-b', 'main', bare);
		// Stands in for the sidecar's notify-the-app hook.
		writeFileSync(join(bare, 'hooks', 'post-receive'), `#!/bin/sh\ntouch "${hookRan}"\n`);
		chmodSync(join(bare, 'hooks', 'post-receive'), 0o755);
		git(root, 'clone', '-q', bare, documents);
		vi.stubEnv('DATA_DIR', root);
		vi.stubEnv('GIT_SYNC_SECRET', 'test-secret');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		rmSync(root, { recursive: true, force: true });
	});

	it('commits the file and pushes it to the bare repo', async () => {
		writeFileSync(join(documents, 'note.md'), '# Note\n');
		await maybeGitCommit('note.md', 'add note');
		expect(git(bare, 'log', '--format=%s', 'main')).toBe('add note');
		expect(git(bare, 'show', 'main:note.md')).toBe('# Note');
	});

	it('does not run the bare repo hook for its own push', async () => {
		writeFileSync(join(documents, 'note.md'), '# Note\n');
		await maybeGitCommit('note.md', 'add note');
		expect(existsSync(hookRan)).toBe(false);
	});

	it('the hook does fire for an ordinary push, so the check above can fail', () => {
		writeFileSync(join(documents, 'other.md'), '# Other\n');
		git(documents, 'add', 'other.md');
		git(documents, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'other');
		git(documents, 'push', '-q', 'origin', 'HEAD');
		expect(existsSync(hookRan)).toBe(true);
	});

	it('does nothing when the adapter is off', async () => {
		vi.stubEnv('GIT_SYNC_SECRET', '');
		writeFileSync(join(documents, 'note.md'), '# Note\n');
		await maybeGitCommit('note.md', 'add note');
		expect(git(documents, 'status', '--short')).toBe('?? note.md');
	});

	describe('gitPull', () => {
		function pushFromElsewhere(file: string) {
			const other = join(root, 'other');
			if (!existsSync(other)) git(root, 'clone', '-q', bare, other);
			writeFileSync(join(other, file), `# ${file}\n`);
			git(other, 'add', file);
			git(other, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', `add ${file}`);
			git(other, 'push', '-q', 'origin', 'HEAD');
		}

		it('takes the first push into a repository that has no commits yet', async () => {
			// A fresh install: the working clone has no HEAD. Obsidian pushes first.
			pushFromElsewhere('first.md');
			expect(await gitPull()).toEqual(['first.md']);
			expect(git(documents, 'log', '--format=%s')).toBe('add first.md');
		});

		it('lists only the markdown files a later push changed', async () => {
			pushFromElsewhere('first.md');
			await gitPull();
			pushFromElsewhere('second.md');
			expect(await gitPull()).toEqual(['second.md']);
		});

		it('reports nothing when there is nothing new', async () => {
			pushFromElsewhere('first.md');
			await gitPull();
			expect(await gitPull()).toEqual([]);
		});
	});
});
