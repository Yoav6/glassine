import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

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

export function gitSyncSecret(): string {
	return process.env.GIT_SYNC_SECRET ?? '';
}

export function gitEnabled(): boolean {
	return Boolean(gitSyncSecret());
}

export function gitRemoteUrl(): string {
	const explicit = (process.env.GIT_REMOTE_URL ?? '').replace(/\/$/, '');
	if (explicit) return explicit;
	return `https://git.${domain()}/glassine.git`;
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
	mkdirSync(documentsDir(), { recursive: true });
	mkdirSync(dirname(dbPath()), { recursive: true });
}
