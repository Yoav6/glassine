import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { defaultGitDomain } from '../git-domain';

function loadEnvFile(path: string) {
	if (!existsSync(path)) return;
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq < 1) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (process.env[key] == null) process.env[key] = value;
	}
}

loadEnvFile(resolve(process.cwd(), '.env'));

function required(name: string, fallback?: string): string {
	const value = process.env[name] ?? fallback;
	if (!value) {
		throw new Error(`Missing required environment variable ${name}`);
	}
	return value;
}

export function dataDir(): string {
	const dir = process.env.DATA_DIR ?? './data';
	return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

export function documentsDir(): string {
	return resolve(dataDir(), 'documents');
}

export function dbPath(): string {
	return resolve(dataDir(), 'glassine.db');
}

export function publicOrigin(): string {
	return (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
}

export function trustedOrigins(): string[] {
	const origin = publicOrigin();
	const extras = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
		.split(',')
		.map((value) => value.trim().replace(/\/$/, ''))
		.filter(Boolean);
	const local =
		domain() === 'localhost' || origin.includes('localhost') || origin.includes('127.0.0.1')
			? [
					'http://localhost:3000',
					'http://localhost:5173',
					'http://localhost:4173',
					'http://127.0.0.1:3000',
					'http://127.0.0.1:5173',
					'http://127.0.0.1:4173'
				]
			: [];
	return [...new Set([origin, ...extras, ...local])];
}

export function authSecret(): string {
	return required('BETTER_AUTH_SECRET');
}

export function authorEmail(): string {
	return (process.env.AUTHOR_EMAIL ?? '').toLowerCase();
}

export function domain(): string {
	return process.env.DOMAIN ?? 'localhost';
}

export function mailEnabled(): boolean {
	return Boolean(process.env.SMTP_URL || process.env.MAIL_FROM);
}

export function smtpUrl(): string {
	return process.env.SMTP_URL ?? '';
}

export function mailFrom(): string {
	return process.env.MAIL_FROM ?? '';
}

function minutes(name: string, fallback: number): number {
	const raw = Number(process.env[name]);
	return Number.isFinite(raw) && raw >= 0 ? raw * 60_000 : fallback * 60_000;
}

/** How long the actor must be quiet before their burst becomes one email. */
export function notifyQuietMs(): number {
	return minutes('NOTIFY_QUIET_MINUTES', 10);
}

/** Mail anyway once the oldest pending item is this old, however chatty the actor. */
export function notifyMaxDelayMs(): number {
	return minutes('NOTIFY_MAX_DELAY_MINUTES', 60);
}

/** Never mail one person more often than this. */
export function notifyMinGapMs(): number {
	return minutes('NOTIFY_MIN_GAP_MINUTES', 5);
}

export function gitSyncSecret(): string {
	return process.env.GIT_SYNC_SECRET ?? '';
}

export function gitEnabled(): boolean {
	return Boolean(gitSyncSecret());
}

/** Hostname the git HTTP remote is served on: `GIT_DOMAIN`, else beside the app. */
export function gitDomain(): string {
	return process.env.GIT_DOMAIN?.trim() || defaultGitDomain(domain());
}

export function gitRemoteUrl(): string {
	const explicit = (process.env.GIT_REMOTE_URL ?? '').replace(/\/$/, '');
	if (explicit) return explicit;
	return `https://${gitDomain()}/glassine.git`;
}

export function gitHttpUser(): string {
	return 'git';
}

export function gitHttpToken(): string {
	return process.env.GIT_HTTP_TOKEN ?? '';
}

/** Remote with basic-auth userinfo for desktop git / Obsidian clone. */
export function gitRemoteCloneUrl(): string | null {
	const token = gitHttpToken();
	if (!token || !gitEnabled()) return null;
	const url = new URL(gitRemoteUrl());
	url.username = gitHttpUser();
	url.password = token;
	return url.href.replace(/\/$/, '');
}

export function ensureDataDirs() {
	try {
		mkdirSync(documentsDir(), { recursive: true });
		mkdirSync(dirname(dbPath()), { recursive: true });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'EACCES') throw err;
		const uid = process.getuid?.();
		throw new Error(
			`Cannot write to DATA_DIR (${dataDir()})${uid === undefined ? '' : `: the app runs as uid ${uid}`}. ` +
				'Make that folder writable by that user, for example `chown -R <uid>:<gid> <folder>` on the host, ' +
				'or run the container as the folder\'s owner with `user:`. See documentation/install.md.',
			{ cause: err }
		);
	}
}
