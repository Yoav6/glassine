import { currentUser } from '$lib/server/guard';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	return {
		user: currentUser(event),
		deviceAccounts: event.locals.deviceAccounts ?? []
	};
};
