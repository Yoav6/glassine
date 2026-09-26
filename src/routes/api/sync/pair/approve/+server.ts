import { error, json } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { approvePairing } from '$lib/server/devices';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const author = requireAuthor(event);
	const body = await event.request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code : '';
	if (!code) error(400, 'code is required');
	try {
		approvePairing(code, author.id);
		return json({ ok: true });
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Could not approve pairing');
	}
};
