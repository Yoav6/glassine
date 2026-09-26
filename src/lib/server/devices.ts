import { and, eq, gt, lt, isNull } from 'drizzle-orm';
import { db } from './db';
import { deviceToken, devicePairing, user } from './db/schema';
import { hashToken, newId, randomToken } from './crypto';
import { publicOrigin } from './env';

const PAIRING_TTL_MS = 10 * 60 * 1000;

/**
 * Raw tokens minted on approval, held in memory only until the pairing
 * client's next poll picks them up (see documentation/sync-api.md). Never
 * persisted in plaintext: `deviceToken.tokenHash` is the durable record. If
 * the process restarts between approval and poll, the pairing cannot be
 * recovered and the client must start over — acceptable for a ~10 minute
 * window, and no worse than the pairing simply expiring.
 */
const pendingTokens = new Map<string, string>();

function cleanupExpiredPairings() {
	db.delete(devicePairing).where(lt(devicePairing.expiresAt, new Date())).run();
}

export function startPairing(deviceName: string): { code: string; pairUrl: string; expiresAt: Date } {
	const name = deviceName.trim();
	if (!name) throw new Error('Device name is required');
	cleanupExpiredPairings();
	const code = randomToken();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
	db.insert(devicePairing)
		.values({
			id: newId(),
			codeHash: hashToken(code),
			deviceName: name,
			status: 'pending',
			userId: null,
			createdAt: now,
			expiresAt
		})
		.run();
	return { code, pairUrl: `${publicOrigin()}/pair?code=${encodeURIComponent(code)}`, expiresAt };
}

function pairingByCode(code: string) {
	return db
		.select()
		.from(devicePairing)
		.where(and(eq(devicePairing.codeHash, hashToken(code)), gt(devicePairing.expiresAt, new Date())))
		.get();
}

/** For the browser approval page: the device name to show, or null if the code is unknown/expired. */
export function pairingDeviceName(code: string): string | null {
	return pairingByCode(code)?.deviceName ?? null;
}

/** Approve a pairing as the given author, minting the device's long-lived token. */
export function approvePairing(code: string, authorUserId: string): void {
	const row = pairingByCode(code);
	if (!row || row.status !== 'pending') throw new Error('Invalid or expired pairing code');
	const token = randomToken();
	db.insert(deviceToken)
		.values({
			id: newId(),
			userId: authorUserId,
			name: row.deviceName,
			tokenHash: hashToken(token),
			createdAt: new Date(),
			lastUsedAt: null,
			revokedAt: null
		})
		.run();
	db.update(devicePairing)
		.set({ status: 'approved', userId: authorUserId })
		.where(eq(devicePairing.id, row.id))
		.run();
	pendingTokens.set(row.id, token);
}

export type PollResult =
	| { status: 'pending' }
	| { status: 'approved'; token: string }
	| { status: 'expired' };

/** Polled by the pairing client. Approved pairings are deleted on their first successful poll. */
export function pollPairing(code: string): PollResult {
	const row = pairingByCode(code);
	if (!row) return { status: 'expired' };
	if (row.status === 'pending') return { status: 'pending' };
	const token = pendingTokens.get(row.id);
	db.delete(devicePairing).where(eq(devicePairing.id, row.id)).run();
	if (!token) return { status: 'expired' };
	pendingTokens.delete(row.id);
	return { status: 'approved', token };
}

export type Device = {
	id: string;
	userId: string;
	name: string;
	createdAt: Date;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
};

export function listDevices(): Device[] {
	return db
		.select({
			id: deviceToken.id,
			userId: deviceToken.userId,
			name: deviceToken.name,
			createdAt: deviceToken.createdAt,
			lastUsedAt: deviceToken.lastUsedAt,
			revokedAt: deviceToken.revokedAt
		})
		.from(deviceToken)
		.all();
}

export function revokeDevice(id: string) {
	db.update(deviceToken).set({ revokedAt: new Date() }).where(eq(deviceToken.id, id)).run();
}

/** The author a bearer token belongs to, or null if it's missing/unknown/revoked. Touches `lastUsedAt`. */
export function authorForDeviceToken(rawToken: string): { id: string; name: string; role: 'author' } | null {
	const row = db
		.select()
		.from(deviceToken)
		.where(and(eq(deviceToken.tokenHash, hashToken(rawToken)), isNull(deviceToken.revokedAt)))
		.get();
	if (!row) return null;
	db.update(deviceToken).set({ lastUsedAt: new Date() }).where(eq(deviceToken.id, row.id)).run();
	const owner = db.select().from(user).where(eq(user.id, row.userId)).get();
	if (!owner) return null;
	return { id: owner.id, name: owner.name, role: 'author' };
}
