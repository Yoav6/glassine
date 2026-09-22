import { createAuthEndpoint, APIError } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import type { BetterAuthPlugin, User } from 'better-auth';
import { eq, and, isNull, gt, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { inviteToken, user } from './db/schema';
import { hashToken } from './crypto';

export const invitePlugin = () => {
	return {
		id: 'glassine-invite',
		endpoints: {
			redeemInvite: createAuthEndpoint(
				'/invite/redeem',
				{
					method: 'POST',
					body: z.object({
						token: z.string().min(8),
						next: z.string().optional()
					})
				},
				async (ctx) => {
					const tokenHash = hashToken(ctx.body.token);
					const now = Date.now();
					const row = db
						.select()
						.from(inviteToken)
						.where(
							and(
								eq(inviteToken.tokenHash, tokenHash),
								isNull(inviteToken.revokedAt),
								or(isNull(inviteToken.expiresAt), gt(inviteToken.expiresAt, new Date(now)))
							)
						)
						.get();
					if (!row) {
						throw new APIError('UNAUTHORIZED', { message: 'Invalid or expired invite' });
					}
					if (row.kind === 'author-setup' && row.usedAt) {
						throw new APIError('UNAUTHORIZED', { message: 'Setup link already used' });
					}
					const reviewer = db.select().from(user).where(eq(user.id, row.reviewerId)).get();
					if (!reviewer) {
						throw new APIError('UNAUTHORIZED', { message: 'Unknown user' });
					}
					const session = await ctx.context.internalAdapter.createSession(reviewer.id);
					if (row.kind === 'author-setup') {
						db.update(inviteToken)
							.set({ usedAt: new Date() })
							.where(eq(inviteToken.id, row.id))
							.run();
					}
					await setSessionCookie(ctx, {
						session,
						// Better Auth's `User` type says `email: string`, since it assumes
						// email/password auth; a reviewer redeeming an invite may not have
						// one (see guard.ts). This call only serializes the object into the
						// session cookie cache, it does not validate it against Better
						// Auth's own schema, so a null email here is safe — confirmed by a
						// real end-to-end redeem + authenticated request for such a user.
						user: {
							id: reviewer.id,
							name: reviewer.name,
							email: reviewer.email,
							emailVerified: reviewer.emailVerified,
							createdAt: reviewer.createdAt,
							updatedAt: reviewer.updatedAt,
							image: reviewer.image
						} as User
					});
					return ctx.json({
						ok: true,
						next: safeNext(ctx.body.next),
						role: reviewer.role
					});
				}
			)
		}
	} satisfies BetterAuthPlugin;
};

function safeNext(next: string | undefined): string {
	if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
	return next;
}
