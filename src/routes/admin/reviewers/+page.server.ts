import { fail } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import {
	listReviewers,
	createReviewer,
	updateReviewer,
	deleteReviewer,
	rotateInvite,
	inviteUrl,
	setGrant,
	revokeGrant
} from '$lib/server/reviewers';
import { listDocuments } from '$lib/server/documents';
import { db } from '$lib/server/db';
import { grant } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
	const reviewers = listReviewers();
	const docs = listDocuments();
	const grants = db.select().from(grant).all();
	return { user, reviewers, docs, grants };
};

export const actions: Actions = {
	create: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const highlightColor = String(form.get('highlightColor') ?? '').trim();
		if (!name || !email) return fail(400, { message: 'Name and email are required' });
		try {
			const created = createReviewer({ name, email, highlightColor: highlightColor || null });
			return { invite: inviteUrl(created.token), name };
		} catch {
			return fail(400, { message: 'Could not create reviewer (email may already exist)' });
		}
	},
	update: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const reviewerId = String(form.get('reviewerId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const highlightColor = String(form.get('highlightColor') ?? '').trim();
		try {
			updateReviewer(reviewerId, {
				name: name || undefined,
				email: email || undefined,
				highlightColor: highlightColor || undefined
			});
			return { saved: true };
		} catch {
			return fail(400, { message: 'Could not update reviewer (email may already exist)' });
		}
	},
	delete: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		try {
			deleteReviewer(String(form.get('reviewerId') ?? ''));
			return { deleted: true };
		} catch {
			return fail(400, { message: 'Could not delete reviewer' });
		}
	},
	copy: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const reviewerId = String(form.get('reviewerId') ?? '');
		const slug = String(form.get('slug') ?? '');
		const token = rotateInvite(reviewerId);
		return { invite: inviteUrl(token, slug || undefined) };
	},
	grant: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		setGrant(
			String(form.get('reviewerId')),
			String(form.get('documentId')),
			String(form.get('visibilityScope') ?? 'own')
		);
		return { ok: true };
	},
	revoke: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		revokeGrant(String(form.get('reviewerId')), String(form.get('documentId')));
		return { ok: true };
	}
};
