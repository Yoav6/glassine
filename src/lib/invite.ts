export const INVITE_TOKEN_PARAM = 'token';

export function isInviteLandingPath(pathname: string): boolean {
	return pathname === '/' || pathname.startsWith('/documents/');
}

export function isInviteLandingRequest(url: Pick<URL, 'pathname' | 'searchParams'>): boolean {
	return isInviteLandingPath(url.pathname) && url.searchParams.has(INVITE_TOKEN_PARAM);
}

export function destinationWithoutInviteToken(url: URL): string {
	const next = new URL(url);
	next.searchParams.delete(INVITE_TOKEN_PARAM);
	const search = next.search;
	return `${next.pathname}${search}` || '/';
}
