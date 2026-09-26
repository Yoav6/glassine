import { requireAuthor } from '$lib/server/guard';
import { listDevices, revokeDevice } from '$lib/server/devices';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
	const devices = listDevices().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	return { user, devices };
};

export const actions: Actions = {
	revoke: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		revokeDevice(String(form.get('deviceId') ?? ''));
		return { ok: true };
	}
};
