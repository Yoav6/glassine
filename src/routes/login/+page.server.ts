import { redirect } from '@sveltejs/kit';
import { currentUser } from '$lib/server/guard';
import { mailEnabled } from '$lib/server/env';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = currentUser(event);
	if (user) redirect(302, user.role === 'author' ? '/admin' : '/reviews');
	return { mail: mailEnabled() };
};
