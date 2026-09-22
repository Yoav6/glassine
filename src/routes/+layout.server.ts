import { currentUser } from '$lib/server/guard';
import { unreadCount } from '$lib/server/notify/read';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const user = currentUser(event);
	return {
		user,
		deviceAccounts: event.locals.deviceAccounts ?? [],
		// One indexed count, so every page renders the bell badge correctly.
		unreadNotifications: user ? unreadCount(user.id) : 0
	};
};
