import { redirect } from '@sveltejs/kit';
import { currentUser } from '$lib/server/guard';
import { mailEnabled } from '$lib/server/env';
import { destinationForAccount, safeNext } from '$lib/accounts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const next = destinationForAccount(
		{ id: 'author', name: 'Author', role: 'author' },
		safeNext(event.url.searchParams.get('next') ?? undefined)
	);
	const user = currentUser(event);
	if (user?.role === 'author') redirect(302, next);
	return { mail: mailEnabled(), next };
};
