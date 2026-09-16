import { redirect } from '@sveltejs/kit';
import { currentUser } from '$lib/server/guard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = currentUser(event);
	if (!user) redirect(302, '/login');
	if (user.role === 'author') redirect(302, '/admin');
	redirect(302, '/reviews');
};
