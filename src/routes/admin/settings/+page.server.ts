import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requireAuthor } from '$lib/server/guard';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { passkey } from '$lib/server/db/schema';
import {
	gitEnabled,
	gitHttpUser,
	gitRemoteCloneUrl,
	gitRemoteUrl,
	mailEnabled,
	publicOrigin
} from '$lib/server/env';
import { mailHost, sendMail, verifyMail } from '$lib/server/mail';
import { getTitleSettings, setTitleSettings, yamlPropertyValid } from '$lib/server/settings';
import { refreshDocumentTitles } from '$lib/server/write';
import { DEFAULT_TITLE_SETTINGS, isTitleSource } from '$lib/title';
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
		gitRemote: gitEnabled() ? gitRemoteUrl() : null,
		gitCloneUrl: gitRemoteCloneUrl(),
		gitUser: gitHttpUser(),
		mail: mailEnabled(),
		mailHost: mailHost(),
		origin: publicOrigin(),
		title: getTitleSettings()
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
	},
	testEmail: async (event) => {
		const user = requireAuthor(event);
		if (!mailEnabled()) {
			return fail(400, { message: 'Set SMTP_URL and MAIL_FROM first.' });
		}
		const check = await verifyMail();
		if (!check.ok) return fail(400, { message: `SMTP check failed: ${check.error}` });
		// The author always has an email in practice (seeded from AUTHOR_EMAIL,
		// required by set-author-email); this only guards the type, which allows
		// null because reviewers may not have one.
		if (!user.email) return fail(400, { message: 'The author account has no email set.' });
		try {
			await sendMail({
				to: user.email,
				subject: 'Glassine test email',
				text:
					'Email is configured correctly.\n\n' +
					`Notification links will point at ${publicOrigin()}/ — if that is not the ` +
					'address you use to reach Glassine, fix PUBLIC_ORIGIN before relying on them.\n'
			});
		} catch (err) {
			return fail(400, {
				message: `Send failed: ${err instanceof Error ? err.message : 'unknown error'}`
			});
		}
		return { testEmail: user.email };
	},
	appearance: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const sourceRaw = String(form.get('titleSource') ?? '');
		if (!isTitleSource(sourceRaw)) return fail(400, { message: 'Choose a title source' });
		const yamlProperty =
			String(form.get('titleYamlProperty') ?? '').trim() || DEFAULT_TITLE_SETTINGS.yamlProperty;
		if (sourceRaw === 'yaml' && !yamlPropertyValid(yamlProperty)) {
			return fail(400, { message: 'YAML property must be a simple key, like title' });
		}
		setTitleSettings({
			source: sourceRaw,
			yamlProperty: yamlPropertyValid(yamlProperty)
				? yamlProperty
				: DEFAULT_TITLE_SETTINGS.yamlProperty
		});
		refreshDocumentTitles();
		return { appearance: true };
	}
};
