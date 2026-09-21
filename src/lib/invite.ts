export const INVITE_TOKEN_PARAM = 'token';

export function isInviteLandingPath(pathname: string): boolean {
	return pathname === '/' || pathname.startsWith('/documents/');
}

export function isInviteLandingRequest(url: Pick<URL, 'pathname' | 'searchParams'>): boolean {
	return isInviteLandingPath(url.pathname) && url.searchParams.has(INVITE_TOKEN_PARAM);
}

/** Where an invite form posts: a named action, since a route with named actions cannot have a default one. */
export function inviteRedeemAction(token: string, action: string): string {
	return `?/${action}&${INVITE_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

export function destinationWithoutInviteToken(url: URL): string {
	const next = new URL(url);
	next.searchParams.delete(INVITE_TOKEN_PARAM);
	// SvelteKit marks the action being posted to as a `?/name` parameter.
	for (const key of [...next.searchParams.keys()]) {
		if (key.startsWith('/')) next.searchParams.delete(key);
	}
	const search = next.search;
	return `${next.pathname}${search}` || '/';
}
