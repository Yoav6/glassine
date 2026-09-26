import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('device pairing', () => {
	let root: string;
	let devices: typeof import('./devices');
	let author: { id: string };

	beforeAll(async () => {
		root = mkdtempSync(join(tmpdir(), 'glassine-devices-'));
		vi.stubEnv('DATA_DIR', root);
		vi.stubEnv('AUTHOR_EMAIL', 'author@example.com');
		vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');

		devices = await import('./devices');
		const { db } = await import('./db');
		const schema = await import('./db/schema');
		const found = db.select().from(schema.user).where(eq(schema.user.email, 'author@example.com')).get();
		if (!found) throw new Error('seeded author not found');
		author = found;
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		rmSync(root, { recursive: true, force: true });
	});

	function authorId(): string {
		return author.id;
	}

	it('polling before approval reports pending', () => {
		const { code } = devices.startPairing('Test Vault');
		expect(devices.pollPairing(code)).toEqual({ status: 'pending' });
	});

	it('an unknown or expired code reports expired', () => {
		expect(devices.pollPairing('not-a-real-code')).toEqual({ status: 'expired' });
	});

	it('approving mints a token that the next poll delivers exactly once', () => {
		const { code } = devices.startPairing('Once Vault');
		devices.approvePairing(code, authorId());
		const first = devices.pollPairing(code);
		expect(first.status).toBe('approved');
		const second = devices.pollPairing(code);
		expect(second).toEqual({ status: 'expired' });
	});

	it('a device resolves back to the author who approved it, until revoked', () => {
		const { code } = devices.startPairing('Resolve Vault');
		devices.approvePairing(code, authorId());
		const poll = devices.pollPairing(code);
		if (poll.status !== 'approved') throw new Error('expected approval');
		const resolved = devices.authorForDeviceToken(poll.token);
		expect(resolved?.id).toBe(authorId());

		const [device] = devices.listDevices().filter((d) => d.name === 'Resolve Vault');
		devices.revokeDevice(device.id);
		expect(devices.authorForDeviceToken(poll.token)).toBeNull();
	});

	it('rejects a garbage token', () => {
		expect(devices.authorForDeviceToken('nonsense')).toBeNull();
	});
});
