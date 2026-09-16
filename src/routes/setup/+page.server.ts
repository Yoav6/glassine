import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const role = locals.user?.role;
	if (role === 'author') {
		return { token: null, enrolled: true };
	}
	if (locals.user) redirect(302, '/reviews');
	const token = url.searchParams.get('token');
	if (!token) redirect(302, '/login');
	return { token, enrolled: false };
};
