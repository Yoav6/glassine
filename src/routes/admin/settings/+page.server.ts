import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireAuthor } from '$lib/server/guard';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { passkey } from '$lib/server/db/schema';
import { gitEnabled, mailEnabled, publicOrigin } from '$lib/server/env';
import type { Actions, PageServerLoad } from './$types';

function listAuthorPasskeys(userId: string) {
	return db
		.select({
			id: passkey.id,
			name: passkey.name,
			deviceType: passkey.deviceType,
			createdAt: passkey.createdAt,
			backedUp: passkey.backedUp
		})
		.from(passkey)
		.where(eq(passkey.userId, userId))
		.all()
		.map((row) => ({
			...row,
			name: row.name ?? '',
			createdAt: row.createdAt ? row.createdAt.toISOString() : null
		}));
}

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
	return {
		user,
		passkeys: listAuthorPasskeys(user.id),
		git: gitEnabled(),
		mail: mailEnabled(),
		origin: publicOrigin()
	};
};

export const actions: Actions = {
	profile: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Name is required' });
		if (name.length > 80) return fail(400, { message: 'Name is too long' });
		try {
			await auth.api.updateUser({
				body: { name },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { message: 'Could not update name' });
		}
		return { saved: true };
	},
	rename: async (event) => {
		const user = requireAuthor(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!id || !name) return fail(400, { message: 'Passkey name is required' });
		if (name.length > 80) return fail(400, { message: 'Passkey name is too long' });
		const result = db
			.update(passkey)
			.set({ name })
			.where(and(eq(passkey.id, id), eq(passkey.userId, user.id)))
			.run();
		if (!result.changes) return fail(400, { message: 'Passkey not found' });
		return { renamed: true };
	},
	remove: async (event) => {
		const user = requireAuthor(event);
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const keys = db
			.select({ id: passkey.id })
			.from(passkey)
			.where(eq(passkey.userId, user.id))
			.all();
		if (!keys.some((key) => key.id === id)) return fail(400, { message: 'Passkey not found' });
		if (keys.length <= 1 && !mailEnabled()) {
			return fail(400, {
				message: 'Register another passkey first, or enable email OTP recovery.'
			});
		}
		db.delete(passkey).where(and(eq(passkey.id, id), eq(passkey.userId, user.id))).run();
		return { deleted: true };
	}
};
