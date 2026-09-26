import { error, json } from '@sveltejs/kit';
import { pollPairing } from '$lib/server/devices';
import type { RequestHandler } from './$types';

/** Unauthenticated: the pairing code itself is the credential for this one poll. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code : '';
	if (!code) error(400, 'code is required');
	return json(pollPairing(code));
};
