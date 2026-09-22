import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export type AppUser = {
	id: string;
	name: string;
	// Reviewers may not have one. Better Auth's own type says `string` (it
	// assumes email/password auth), but reviewers never sign in that way — they
	// redeem an invite token — so this app's rows are the source of truth, not
	// Better Auth's type. The author always has one (seeded from AUTHOR_EMAIL).
	email: string | null;
	role: 'author' | 'reviewer';
	highlightColor: string | null;
};

export function currentUser(event: RequestEvent): AppUser | null {
	const user = event.locals.user;
	if (!user) return null;
	return {
		id: user.id,
		name: user.name,
		email: user.email ?? null,
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
