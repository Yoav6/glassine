import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentsForReviewer } from '$lib/server/documents';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	if (user.role === 'author') redirect(302, '/admin');
	const docs = documentsForReviewer(user.id);
	return { user, docs };
};
