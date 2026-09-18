export const VISIT_COOKIE = 'glassine_visit';
/** Readable by JS so a new tab can detect multiple logins before paint. */
export const MULTI_COOKIE = 'glassine_multi';
/** sessionStorage: this tab’s account choice. Cleared when the tab closes. */
export const TAB_ACCOUNT_KEY = 'glassine_tab_account';
/** sessionStorage: unique id for this tab’s choice, used to detect a duplicated tab. */
export const TAB_NONCE_KEY = 'glassine_tab_nonce';
/** Short-lived, readable cookie that copies the choice into sessionStorage after login. */
export const TAB_BIND_COOKIE = 'glassine_tab_bind';
/** Web Lock / BroadcastChannel name prefix so two live tabs cannot share one choice. */
export const TAB_LOCK_PREFIX = 'glassine_tab_';

import { isInviteLandingRequest } from '$lib/invite';

export type AccountRole = 'author' | 'reviewer';

export type DeviceAccount = {
	id: string;
	name: string;
	role: AccountRole;
};

export function asAccountRole(role: string | null | undefined): AccountRole {
	return role === 'author' ? 'author' : 'reviewer';
}

export function needsAccountChoice(opts: {
	accounts: { id: string }[];
	visitUserId: string | undefined;
	sessionUserId: string | undefined;
}): boolean {
	if (opts.accounts.length < 2) return false;
	if (!opts.visitUserId || !opts.sessionUserId) return true;
	if (opts.visitUserId !== opts.sessionUserId) return true;
	return !opts.accounts.some((account) => account.id === opts.visitUserId);
}

export function isAccountChoiceExemptPath(pathname: string): boolean {
	if (pathname.startsWith('/api/auth')) return true;
	if (pathname === '/choose' || pathname.startsWith('/choose/')) return true;
	if (pathname === '/login' || pathname.startsWith('/login/')) return true;
	if (pathname === '/setup' || pathname.startsWith('/setup')) return true;
	return false;
}

export function isAccountChoiceExempt(url: URL): boolean {
	if (isAccountChoiceExemptPath(url.pathname)) return true;
	return isInviteLandingRequest(url);
}

export function shouldForceAccountChooser(opts: {
	hasMultipleAccounts: boolean;
	tabAccountId: string | null | undefined;
	pathname: string;
	choiceHeldByAnotherTab?: boolean;
	isReload?: boolean;
}): boolean {
	if (!opts.hasMultipleAccounts) return false;
	if (isAccountChoiceExemptPath(opts.pathname)) return false;
	if (!opts.tabAccountId) return true;
	if (opts.isReload) return false;
	return Boolean(opts.choiceHeldByAnotherTab);
}

export function safeNext(next: string | undefined, fallback = '/'): string {
	if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
	return next;
}

export function homeForRole(role: AccountRole): string {
	return role === 'author' ? '/admin' : '/';
}

export function destinationForAccount(account: DeviceAccount, next: string | undefined): string {
	const home = homeForRole(account.role);
	const safe = safeNext(next, home);
	if (safe === '/' || safe === '/choose' || safe === '/login' || safe.startsWith('/login/')) {
		return home;
	}
	if (
		account.role === 'reviewer' &&
		(safe.startsWith('/admin') || safe === '/setup' || safe.startsWith('/setup'))
	) {
		return home;
	}
	return safe;
}

export function accountLabel(account: DeviceAccount): string {
	return `${account.name} (${account.role === 'author' ? 'author' : 'reviewer'})`;
}

export function destinationAfterLeavingAccount(opts: {
	wasCurrent: boolean;
	remaining: DeviceAccount[];
	nextAccount: DeviceAccount | null;
	next?: string;
}): string {
	if (!opts.wasCurrent) return safeNext(opts.next, '/');
	if (opts.remaining.length === 0) return '/login';
	if (opts.remaining.length === 1 && opts.nextAccount) {
		return destinationForAccount(opts.nextAccount, opts.next);
	}
	return '/choose';
}
