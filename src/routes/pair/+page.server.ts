import { fail } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { approvePairing, pairingDeviceName } from '$lib/server/devices';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
	const code = event.url.searchParams.get('code') ?? '';
	const deviceName = code ? pairingDeviceName(code) : null;
	return { user, code, deviceName };
};

export const actions: Actions = {
	approve: async (event) => {
		const author = requireAuthor(event);
		const form = await event.request.formData();
		const code = String(form.get('code') ?? '');
		try {
			approvePairing(code, author.id);
			return { approved: true };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'Could not approve pairing' });
		}
	}
};
