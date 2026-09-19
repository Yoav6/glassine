import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const EXAMPLE = resolve(process.cwd(), '.env.example');
const TARGET = resolve(process.cwd(), '.env');

function randomSecret() {
	return randomBytes(32).toString('base64');
}

/** URL-safe; use for GIT_HTTP_TOKEN so `http://git:token@host/...` does not break. */
function randomHttpToken() {
	return randomBytes(32).toString('hex');
}

function isPlaceholder(value: string) {
	return !value || /^change-me/i.test(value);
}

function parseAssignment(line: string): { key: string; value: string; commented: boolean } | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	const commented = trimmed.startsWith('#');
	const body = commented ? trimmed.replace(/^#\s*/, '') : trimmed;
	const eq = body.indexOf('=');
	if (eq < 1) return null;
	const key = body.slice(0, eq).trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
	let value = body.slice(eq + 1).trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}
	return { key, value, commented };
}

function setOrFill(lines: string[], key: string, generate: () => string): string[] {
	let found = false;
	const next = lines.map((line) => {
		const parsed = parseAssignment(line);
		if (!parsed || parsed.key !== key) return line;
		found = true;
		if (!isPlaceholder(parsed.value)) {
			return parsed.commented ? `${key}=${parsed.value}` : line;
		}
		return `${key}=${generate()}`;
	});
	if (found) return next;
	return [...next, `${key}=${generate()}`];
}

function ensureComposeGit(lines: string[]): string[] {
	let found = false;
	const next = lines.map((line) => {
		const parsed = parseAssignment(line);
		if (!parsed || parsed.key !== 'COMPOSE_PROFILES') return line;
		found = true;
		const profiles = parsed.value
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean);
		if (!profiles.includes('git')) profiles.push('git');
		return `COMPOSE_PROFILES=${profiles.join(',')}`;
	});
	if (found) return next;
	return [...next, 'COMPOSE_PROFILES=git'];
}

function readKey(lines: string[], key: string): string {
	for (const line of lines) {
		const parsed = parseAssignment(line);
		if (parsed && !parsed.commented && parsed.key === key && parsed.value) {
			return parsed.value;
		}
	}
	return '';
}

export function initEnv(opts: { git: boolean; loopback: boolean }) {
	if (!existsSync(TARGET)) {
		if (!existsSync(EXAMPLE)) {
			throw new Error('Missing .env.example');
		}
		copyFileSync(EXAMPLE, TARGET);
		console.log('Created .env from .env.example');
	}

	let lines = readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n').split('\n');
	if (lines.at(-1) === '') lines = lines.slice(0, -1);

	lines = setOrFill(lines, 'BETTER_AUTH_SECRET', randomSecret);
	if (opts.loopback) {
		lines = setOrFill(lines, 'COMPOSE_FILE', () => 'compose.yaml:compose.loopback.yaml');
	}
	if (opts.git) {
		lines = ensureComposeGit(lines);
		lines = setOrFill(lines, 'GIT_HTTP_TOKEN', randomHttpToken);
		lines = setOrFill(lines, 'GIT_SYNC_SECRET', randomSecret);
		if (opts.loopback) {
			lines = setOrFill(lines, 'GIT_REMOTE_URL', () => 'http://127.0.0.1:8081/glassine.git');
			lines = setOrFill(
				lines,
				'GIT_SYNC_URL',
				() => 'http://host.docker.internal:5173/api/adapter/sync'
			);
		}
	}

	writeFileSync(TARGET, `${lines.join('\n')}\n`);
	console.log('Updated .env (existing secrets were left as-is).');

	if (opts.git) {
		const remote =
			readKey(lines, 'GIT_REMOTE_URL') ||
			`https://git.${readKey(lines, 'DOMAIN') || 'localhost'}/glassine.git`;
		console.log(`Git remote: ${remote}`);
		console.log('Username: git');
		console.log('Password: GIT_HTTP_TOKEN in .env (not the sync secret)');
	}
	if (opts.loopback) {
		console.log('Vite: http://localhost:5173  |  git sidecar only (no Compose app)');
		console.log('Need git on the host PATH for accept/commit from `npm run dev`.');
	}
}
