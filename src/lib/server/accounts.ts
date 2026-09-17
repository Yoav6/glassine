import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { asAccountRole, MULTI_COOKIE, TAB_BIND_COOKIE, VISIT_COOKIE, type DeviceAccount } from '$lib/accounts';
import { auth } from './auth';
import { db } from './db';
import { user } from './db/schema';
import { publicOrigin } from './env';

function cookieBase() {
	return {
		path: '/',
		sameSite: 'lax' as const,
		secure: publicOrigin().startsWith('https://')
	};
}

export function visitCookieOptions() {
	return {
		...cookieBase(),
		httpOnly: true
	};
}

export function writeMultiAccountFlag(cookies: Cookies, multiple: boolean) {
	if (multiple) {
		cookies.set(MULTI_COOKIE, '1', {
			...cookieBase(),
			httpOnly: false,
			maxAge: 60 * 60 * 24 * 30
		});
		return;
	}
	cookies.delete(MULTI_COOKIE, { path: '/' });
}

export function readVisitUserId(cookies: Cookies): string | undefined {
	return cookies.get(VISIT_COOKIE) || undefined;
}

export function writeVisitUserId(cookies: Cookies, userId: string) {
	cookies.set(VISIT_COOKIE, userId, visitCookieOptions());
	cookies.set(TAB_BIND_COOKIE, userId, {
		...cookieBase(),
		httpOnly: false
	});
}

export function clearVisitUserId(cookies: Cookies) {
	cookies.delete(VISIT_COOKIE, { path: '/' });
	cookies.delete(TAB_BIND_COOKIE, { path: '/' });
}

type ListedSession = {
	account: DeviceAccount;
	sessionToken: string;
};

async function listDeviceSessionRows(headers: Headers): Promise<ListedSession[]> {
	let sessions: Awaited<ReturnType<typeof auth.api.listDeviceSessions>> = [];
	try {
		sessions = await auth.api.listDeviceSessions({ headers });
	} catch {
		return [];
	}
	if (!Array.isArray(sessions)) return [];
	const listed: ListedSession[] = [];
	for (const item of sessions) {
		const row = db
			.select({ id: user.id, name: user.name, role: user.role })
			.from(user)
			.where(eq(user.id, item.user.id))
			.get();
		if (!row) continue;
		listed.push({
			account: {
				id: row.id,
				name: row.name,
				role: asAccountRole(row.role)
			},
			sessionToken: item.session.token
		});
	}
	return listed;
}

export async function listDeviceAccounts(headers: Headers): Promise<DeviceAccount[]> {
	return (await listDeviceSessionRows(headers)).map((row) => row.account);
}

export async function activateDeviceAccount(
	event: RequestEvent,
	userId: string
): Promise<DeviceAccount | null> {
	const match = (await listDeviceSessionRows(event.request.headers)).find(
		(row) => row.account.id === userId
	);
	if (!match) return null;
	await auth.api.setActiveSession({
		body: { sessionToken: match.sessionToken },
		headers: event.request.headers
	});
	writeVisitUserId(event.cookies, match.account.id);
	return match.account;
}

export async function leaveDeviceAccount(
	event: RequestEvent,
	userId: string
): Promise<{ remaining: DeviceAccount[]; wasCurrent: boolean; nextAccount: DeviceAccount | null }> {
	const rows = await listDeviceSessionRows(event.request.headers);
	const matches = rows.filter((row) => row.account.id === userId);
	if (!matches.length) {
		return { remaining: rows.map((row) => row.account), wasCurrent: false, nextAccount: null };
	}
	const wasCurrent = event.locals.user?.id === userId;
	for (const match of matches) {
		try {
			await auth.api.revokeDeviceSession({
				body: { sessionToken: match.sessionToken },
				headers: event.request.headers
			});
		} catch {
			if (wasCurrent) await auth.api.signOut({ headers: event.request.headers });
		}
	}
	const remaining = rows.filter((row) => row.account.id !== userId);
	if (wasCurrent && remaining.length === 1) {
		await auth.api.setActiveSession({
			body: { sessionToken: remaining[0].sessionToken },
			headers: event.request.headers
		});
		writeVisitUserId(event.cookies, remaining[0].account.id);
		return {
			remaining: remaining.map((row) => row.account),
			wasCurrent,
			nextAccount: remaining[0].account
		};
	}
	if (wasCurrent) clearVisitUserId(event.cookies);
	return { remaining: remaining.map((row) => row.account), wasCurrent, nextAccount: null };
}

export async function leaveCurrentAccount(event: RequestEvent) {
	const id = event.locals.user?.id;
	if (id) {
		await leaveDeviceAccount(event, id);
		return;
	}
	clearVisitUserId(event.cookies);
}
