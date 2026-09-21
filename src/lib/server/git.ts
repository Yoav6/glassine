import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { documentsDir, gitEnabled } from './env';

const exec = promisify(execFile);

let gitLock: Promise<unknown> = Promise.resolve();

function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
	const run = gitLock.then(fn, fn);
	gitLock = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

async function gitCommitAndPush(cwd: string, message: string) {
	await exec(
		'git',
		['-c', 'user.email=glassine@local', '-c', 'user.name=Glassine', 'commit', '-m', message],
		{ cwd }
	);
	// Hooks are off for our own push. The bare repo's post-receive hook exists to
	// tell the app about pushes from elsewhere (Obsidian); for a commit the app
	// just made there is nothing to ingest, and the hook needs curl, which the app
	// image does not ship. `git -c core.hooksPath=... push` does not work for this:
	// git drops `-c` config when it starts the local receive-pack, so the receiving
	// side has to be started with the option itself.
	await exec(
		'git',
		['push', '--receive-pack=git -c core.hooksPath=/dev/null receive-pack', 'origin', 'HEAD'],
		{ cwd }
	);
}

export async function maybeGitCommit(relativePath: string, message: string) {
	return withGitLock(async () => {
		if (!gitEnabled()) return;
		const cwd = documentsDir();
		if (!existsSync(join(cwd, '.git'))) return;
		try {
			await exec('git', ['add', '--', relativePath], { cwd });
			await gitCommitAndPush(cwd, message);
		} catch (err) {
			console.warn('git adapter commit skipped:', err);
		}
	});
}

export async function maybeGitMove(from: string, to: string, message: string) {
	return withGitLock(async () => {
		if (!gitEnabled()) return;
		const cwd = documentsDir();
		if (!existsSync(join(cwd, '.git'))) return;
		try {
			await exec('git', ['add', '-A', '--', from, to], { cwd });
			await gitCommitAndPush(cwd, message);
		} catch (err) {
			console.warn('git adapter move skipped:', err);
		}
	});
}

export async function maybeGitRemove(relativePath: string, message: string) {
	return withGitLock(async () => {
		if (!gitEnabled()) return;
		const cwd = documentsDir();
		if (!existsSync(join(cwd, '.git'))) return;
		try {
			await exec('git', ['rm', '-f', '--', relativePath], { cwd });
			await gitCommitAndPush(cwd, message);
		} catch (err) {
			console.warn('git adapter remove skipped:', err);
		}
	});
}

async function remoteTip(cwd: string): Promise<string | null> {
	for (const ref of ['refs/remotes/origin/master', 'refs/remotes/origin/main', 'origin/HEAD']) {
		try {
			const tip = await exec('git', ['rev-parse', '--verify', ref], { cwd });
			return tip.stdout.trim();
		} catch {
			/* try next */
		}
	}
	return null;
}

/** The empty tree, so a diff against it lists every file of the first commit. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** HEAD's commit, or null on a fresh install whose clone has no commits yet. */
async function currentHead(cwd: string): Promise<string | null> {
	try {
		return (await exec('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd })).stdout.trim();
	} catch {
		return null;
	}
}

export async function gitPull(): Promise<string[]> {
	return withGitLock(async () => {
		if (!gitEnabled()) return [];
		const cwd = documentsDir();
		if (!existsSync(join(cwd, '.git'))) return [];
		const before = await currentHead(cwd);
		// Fetch over the bind-mounted relative origin — no Docker/Vite network.
		await exec('git', ['fetch', 'origin'], { cwd });
		const tip = await remoteTip(cwd);
		if (!tip || tip === before) return [];
		await exec('git', ['merge', '--ff-only', tip], { cwd });
		const after = await currentHead(cwd);
		if (!after || before === after) return [];
		const diff = await exec('git', ['diff', '--name-only', before ?? EMPTY_TREE, after], { cwd });
		return diff.stdout
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.endsWith('.md'));
	});
}
