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
	await exec('git', ['push', 'origin', 'HEAD'], { cwd });
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

export async function gitPull(): Promise<string[]> {
	return withGitLock(async () => {
		if (!gitEnabled()) return [];
		const cwd = documentsDir();
		if (!existsSync(join(cwd, '.git'))) return [];
		const before = (await exec('git', ['rev-parse', 'HEAD'], { cwd })).stdout.trim();
		// Fetch over the bind-mounted relative origin — no Docker/Vite network.
		await exec('git', ['fetch', 'origin'], { cwd });
		const tip = await remoteTip(cwd);
		if (!tip || tip === before) return [];
		await exec('git', ['merge', '--ff-only', tip], { cwd });
		const after = (await exec('git', ['rev-parse', 'HEAD'], { cwd })).stdout.trim();
		if (before === after) return [];
		const diff = await exec('git', ['diff', '--name-only', before, after], { cwd });
		return diff.stdout
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.endsWith('.md'));
	});
}
