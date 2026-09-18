import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { safeNext } from '$lib/accounts';
import { destinationWithoutInviteToken, INVITE_TOKEN_PARAM } from '$lib/invite';
import { auth } from './auth';

export function readInviteToken(url: URL): string | null {
	return url.searchParams.get(INVITE_TOKEN_PARAM);
}

export async function redeemInviteAction(event: RequestEvent, fallback = '/') {
	const token = readInviteToken(event.url);
	if (!token) return fail(400, { message: 'Missing invite token.' });
	const next = destinationWithoutInviteToken(event.url);
	try {
		await auth.api.redeemInvite({
			body: { token, next },
			headers: event.request.headers
		});
	} catch {
		return fail(401, { message: 'This invite is invalid or has been rotated.' });
	}
	redirect(303, safeNext(next, fallback));
}
