import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { safeNext } from '$lib/accounts';
import type { Actions } from './$types';

function inviteNext(url: URL): string {
	const slug = url.searchParams.get('document');
	return slug ? `/documents/${slug}` : '/reviews';
}

export const actions: Actions = {
	default: async (event) => {
		const next = inviteNext(event.url);
		try {
			await auth.api.redeemInvite({
				body: { token: event.params.token, next },
				headers: event.request.headers
			});
		} catch {
			return fail(401, { message: 'This invite is invalid or has been rotated.' });
		}
		redirect(303, safeNext(next, '/reviews'));
	}
};
