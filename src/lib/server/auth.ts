import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { passkey } from '@better-auth/passkey';
import { emailOTP, multiSession } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from './db';
import * as schema from './db/schema';
import { invitePlugin } from './invite-plugin';
import { visitChoicePlugin } from './visit-plugin';
import { authSecret, domain, mailEnabled, publicOrigin, trustedOrigins } from './env';
import { sendMail } from './mail';

const origin = publicOrigin();
const isHttps = origin.startsWith('https://');

export const auth = betterAuth({
	appName: 'Glassine',
	baseURL: origin,
	secret: authSecret(),
	trustedOrigins: trustedOrigins(),
	database: drizzleAdapter(db, {
		provider: 'sqlite',
		camelCase: true,
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
			passkey: schema.passkey
		}
	}),
	emailAndPassword: {
		enabled: false,
		disableSignUp: true
	},
	user: {
		additionalFields: {
			role: {
				type: 'string',
				required: true,
				defaultValue: 'reviewer',
				input: false
			},
			highlightColor: {
				type: 'string',
				required: false,
				input: false
			}
		}
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5
		}
	},
	advanced: {
		useSecureCookies: isHttps,
		defaultCookieAttributes: {
			httpOnly: true,
			sameSite: 'lax',
			secure: isHttps,
			path: '/'
		}
	},
	plugins: [
		invitePlugin(),
		passkey({
			rpID: domain() === 'localhost' ? 'localhost' : domain(),
			rpName: 'Glassine',
			origin
		}),
		...(mailEnabled()
			? [
					emailOTP({
						sendVerificationOTP: async ({ email, otp }) => {
							await sendMail({
								to: email,
								subject: 'Your Glassine sign-in code',
								text: `Your sign-in code is ${otp}. It expires shortly.`
							});
						}
					})
				]
			: []),
		multiSession(),
		visitChoicePlugin(),
		sveltekitCookies(getRequestEvent)
	]
});

export type SessionUser = typeof auth.$Infer.Session.user & {
	role: 'author' | 'reviewer';
	highlightColor?: string | null;
};
