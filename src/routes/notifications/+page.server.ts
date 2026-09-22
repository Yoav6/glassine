import { requireUser } from '$lib/server/guard';
import { markAllRead, recentNotifications } from '$lib/server/notify/read';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	return { notifications: recentNotifications(user.id, 100) };
};

export const actions: Actions = {
	readAll: async (event) => {
		const user = requireUser(event);
		markAllRead(user.id);
		return { ok: true };
	}
};
