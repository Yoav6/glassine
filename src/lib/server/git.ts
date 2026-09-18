import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { documentsDir, gitEnabled } from './env';

const exec = promisify(execFile);

async function gitCommitAndPush(cwd: string, message: string) {
	await exec(
		'git',
		['-c', 'user.email=glassine@local', '-c', 'user.name=Glassine', 'commit', '-m', message],
		{ cwd }
	);
	await exec('git', ['push', 'origin', 'HEAD'], { cwd });
}

export async function maybeGitCommit(relativePath: string, message: string) {
	if (!gitEnabled()) return;
	const cwd = documentsDir();
	if (!existsSync(join(cwd, '.git'))) return;
	try {
		await exec('git', ['add', '--', relativePath], { cwd });
		await gitCommitAndPush(cwd, message);
	} catch (err) {
		console.warn('git adapter commit skipped:', err);
	}
}

export async function maybeGitMove(from: string, to: string, message: string) {
	if (!gitEnabled()) return;
	const cwd = documentsDir();
	if (!existsSync(join(cwd, '.git'))) return;
	try {
		await exec('git', ['add', '-A', '--', from, to], { cwd });
		await gitCommitAndPush(cwd, message);
	} catch (err) {
		console.warn('git adapter move skipped:', err);
	}
}

export async function maybeGitRemove(relativePath: string, message: string) {
	if (!gitEnabled()) return;
	const cwd = documentsDir();
	if (!existsSync(join(cwd, '.git'))) return;
	try {
		await exec('git', ['rm', '-f', '--', relativePath], { cwd });
		await gitCommitAndPush(cwd, message);
	} catch (err) {
		console.warn('git adapter remove skipped:', err);
	}
}

export async function gitPull(): Promise<string[]> {
	if (!gitEnabled()) return [];
	const cwd = documentsDir();
	if (!existsSync(join(cwd, '.git'))) return [];
	const before = await exec('git', ['rev-parse', 'HEAD'], { cwd });
	await exec('git', ['pull', '--ff-only', 'origin'], { cwd });
	const after = await exec('git', ['rev-parse', 'HEAD'], { cwd });
	if (before.stdout.trim() === after.stdout.trim()) return [];
	const diff = await exec('git', ['diff', '--name-only', before.stdout.trim(), after.stdout.trim()], {
		cwd
	});
	return diff.stdout
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s.endsWith('.md'));
}
