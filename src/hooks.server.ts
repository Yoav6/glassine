import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { ensureReady } from '$lib/server/db';
import { isAccountChoiceExempt, needsAccountChoice } from '$lib/accounts';
import { listDeviceAccounts, readVisitUserId, writeMultiAccountFlag } from '$lib/server/accounts';

export async function handle({ event, resolve }) {
	ensureReady();
	event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
	if (event.url.pathname.startsWith('/api/auth')) {
		return svelteKitHandler({ event, resolve, auth, building });
	}
	const session = await auth.api.getSession({ headers: event.request.headers });
	const deviceAccounts = await listDeviceAccounts(event.request.headers);
	event.locals.deviceAccounts = deviceAccounts;
	writeMultiAccountFlag(event.cookies, deviceAccounts.length >= 2);
	const visitUserId = readVisitUserId(event.cookies);
	const sessionUserId = session?.user.id;
	const mustChoose = needsAccountChoice({
		accounts: deviceAccounts,
		visitUserId,
		sessionUserId
	});
	event.locals.needsAccountChoice = mustChoose;
	if (mustChoose) {
		event.locals.session = null;
		event.locals.user = null;
		if (!isAccountChoiceExempt(event.url)) {
			if (event.url.pathname.startsWith('/api/')) {
				return new Response('Choose an account', { status: 401 });
			}
			const next = `${event.url.pathname}${event.url.search}`;
			redirect(303, `/choose?next=${encodeURIComponent(next)}`);
		}
	} else if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user as App.Locals['user'];
	} else {
		event.locals.session = null;
		event.locals.user = null;
	}
	return resolve(event);
}
