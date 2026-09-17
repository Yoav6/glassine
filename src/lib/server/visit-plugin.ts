import { createAuthMiddleware } from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';
import { publicOrigin } from './env';
import { TAB_BIND_COOKIE, VISIT_COOKIE } from '$lib/accounts';

const CHOICE_PATHS = new Set([
	'/invite/redeem',
	'/multi-session/set-active',
	'/sign-in/email-otp',
	'/passkey/verify-authentication'
]);

function visitCookieAttrs() {
	const secure = publicOrigin().startsWith('https://');
	return {
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		path: '/'
	};
}

function tabBindCookieAttrs() {
	const secure = publicOrigin().startsWith('https://');
	return {
		httpOnly: false,
		sameSite: 'lax' as const,
		secure,
		path: '/'
	};
}

export function visitChoicePlugin() {
	return {
		id: 'glassine-visit-choice',
		hooks: {
			after: [
				{
					matcher: (ctx) => Boolean(ctx.path && CHOICE_PATHS.has(ctx.path)),
					handler: createAuthMiddleware(async (ctx) => {
						const session = ctx.context.newSession;
						if (!session) return;
						ctx.setCookie(VISIT_COOKIE, session.user.id, visitCookieAttrs());
						ctx.setCookie(TAB_BIND_COOKIE, session.user.id, tabBindCookieAttrs());
					})
				},
				{
					matcher: (ctx) => ctx.path === '/sign-out' || ctx.path === '/multi-session/revoke',
					handler: createAuthMiddleware(async (ctx) => {
						ctx.setCookie(VISIT_COOKIE, '', { ...visitCookieAttrs(), maxAge: 0 });
						ctx.setCookie(TAB_BIND_COOKIE, '', { ...tabBindCookieAttrs(), maxAge: 0 });
					})
				}
			]
		}
	} satisfies BetterAuthPlugin;
}
