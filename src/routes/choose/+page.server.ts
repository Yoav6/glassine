import { fail, redirect } from '@sveltejs/kit';
import { destinationAfterLeavingAccount, destinationForAccount, homeForRole, safeNext } from '$lib/accounts';
import { currentUser } from '$lib/server/guard';
import { activateDeviceAccount, leaveDeviceAccount } from '$lib/server/accounts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const accounts = event.locals.deviceAccounts ?? [];
	if (accounts.length < 2) {
		const user = currentUser(event);
		if (user) redirect(302, homeForRole(user.role));
		redirect(302, '/login');
	}
	return {
		accounts,
		next: safeNext(event.url.searchParams.get('next') ?? undefined)
	};
};

export const actions: Actions = {
	activate: async (event) => {
		const form = await event.request.formData();
		const userId = String(form.get('userId') ?? '');
		const account = await activateDeviceAccount(event, userId);
		if (!account) return fail(400, { message: 'That account is not available on this device.' });
		redirect(303, destinationForAccount(account, String(form.get('next') ?? '')));
	},
	leave: async (event) => {
		const form = await event.request.formData();
		const userId = String(form.get('userId') ?? event.locals.user?.id ?? '');
		if (!userId) redirect(303, '/login');
		const result = await leaveDeviceAccount(event, userId);
		redirect(
			303,
			destinationAfterLeavingAccount({
				...result,
				next: String(form.get('next') ?? '')
			})
		);
	}
};
