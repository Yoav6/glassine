import { error, json } from '@sveltejs/kit';
import { startPairing } from '$lib/server/devices';
import type { RequestHandler } from './$types';

/** Unauthenticated: any client can request a pairing, but nothing is granted until an author approves it in a browser. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const deviceName = typeof body?.deviceName === 'string' ? body.deviceName : '';
	if (!deviceName.trim()) error(400, 'deviceName is required');
	try {
		const { code, pairUrl, expiresAt } = startPairing(deviceName);
		return json({ code, pairUrl, expiresAt });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Could not start pairing');
	}
};
