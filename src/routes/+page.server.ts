import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentsForReviewer } from '$lib/server/documents';
import { readInviteToken, redeemInviteAction } from '$lib/server/invite-landing';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const token = readInviteToken(event.url);
	if (token) {
		return { inviteToken: token, user: null, docs: [] };
	}
	const user = requireUser(event);
	if (user.role === 'author') redirect(302, '/admin');
	const docs = documentsForReviewer(user.id);
	return { inviteToken: null, user, docs };
};

export const actions: Actions = {
	default: (event) => redeemInviteAction(event, '/')
};
