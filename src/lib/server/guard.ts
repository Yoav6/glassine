import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export type AppUser = {
	id: string;
	name: string;
	email: string;
	role: 'author' | 'reviewer';
	highlightColor: string | null;
};

export function currentUser(event: RequestEvent): AppUser | null {
	const user = event.locals.user;
	if (!user) return null;
	return {
		id: user.id,
		name: user.name,
		email: user.email,
		role: (user.role as 'author' | 'reviewer') ?? 'reviewer',
		highlightColor: (user.highlightColor as string | null) ?? null
	};
}

function loginRedirect(event: RequestEvent): string {
	const next = `${event.url.pathname}${event.url.search}`;
	return `/login?next=${encodeURIComponent(next)}`;
}

export function requireUser(event: RequestEvent): AppUser {
	const user = currentUser(event);
	if (!user) {
		if (event.url.pathname.startsWith('/api/')) error(401, 'Sign in required');
		redirect(303, loginRedirect(event));
	}
	return user;
}

export function requireAuthor(event: RequestEvent): AppUser {
	const user = requireUser(event);
	if (user.role === 'author') return user;
	if (event.url.pathname.startsWith('/api/')) error(403, 'Author only');
	redirect(303, loginRedirect(event));
}
