import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { ensureReady } from '$lib/server/db';

export async function handle({ event, resolve }) {
	ensureReady();
	event.setHeaders({ 'Referrer-Policy': 'no-referrer' });
	if (event.url.pathname.startsWith('/api/auth')) {
		return svelteKitHandler({ event, resolve, auth, building });
	}
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user as App.Locals['user'];
	} else {
		event.locals.session = null;
		event.locals.user = null;
	}
	return resolve(event);
}
