#!/usr/bin/env node
// Lockfile hygiene check. `npm audit` reports *known* advisories; this catches a
// different failure: a lockfile that has been edited to fetch code from
// somewhere other than the public npm registry. That is what a tampered
// lockfile looks like, and it survives code review easily because a diff of
// 170k lines of JSON does not get read.
//
// Run locally with `npm run audit:lockfile`; CI runs it on every pull request.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTRY = 'https://registry.npmjs.org/';
// Deliberately vendored, see documentation/development.md.
const ALLOWED_LINKS = new Set(['vendor/prosemirror-suggest-changes']);

const lockPath = resolve(process.cwd(), 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const problems = [];

if (lock.lockfileVersion < 3) {
	problems.push(`lockfileVersion is ${lock.lockfileVersion}; expected 3 or newer`);
}

for (const [path, entry] of Object.entries(lock.packages ?? {})) {
	if (path === '') continue;

	if (entry.link) {
		if (!ALLOWED_LINKS.has(entry.resolved)) {
			problems.push(`${path}: links to an unexpected local path (${entry.resolved})`);
		}
		continue;
	}

	// Anything resolved from outside the registry is fetched over a channel the
	// registry's malware takedowns never touch.
	if (entry.resolved && !entry.resolved.startsWith(REGISTRY)) {
		problems.push(`${path}: resolved outside the npm registry (${entry.resolved})`);
	}

	// Without an integrity hash, npm cannot detect that a tarball changed under it.
	if (entry.resolved && !entry.integrity) {
		problems.push(`${path}: no integrity hash`);
	}
}

if (problems.length > 0) {
	console.error(`package-lock.json failed ${problems.length} check(s):\n`);
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error('\nIf one of these is intentional, update scripts/check-lockfile.mjs.');
	process.exit(1);
}

const count = Object.keys(lock.packages ?? {}).length - 1;
console.log(`package-lock.json: ${count} packages, all from ${REGISTRY} with integrity hashes.`);
