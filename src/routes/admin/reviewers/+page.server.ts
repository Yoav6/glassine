import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requireAuthor } from '$lib/server/guard';
import { listReviewers, createReviewer, rotateInvite, inviteUrl, setGrant, revokeGrant, DEFAULT_COLORS } from '$lib/server/reviewers';
import { listDocuments } from '$lib/server/documents';
import { db } from '$lib/server/db';
import { grant } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
	const reviewers = listReviewers();
	const docs = listDocuments();
	const grants = db.select().from(grant).all();
	return { user, reviewers, docs, grants, colors: DEFAULT_COLORS };
};

export const actions: Actions = {
	create: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const highlightColor = String(form.get('highlightColor') ?? DEFAULT_COLORS[0]);
		if (!name || !email) return fail(400, { message: 'Name and email are required' });
		try {
			const created = createReviewer({ name, email, highlightColor });
			return { invite: inviteUrl(created.token), name };
		} catch {
			return fail(400, { message: 'Could not create reviewer (email may already exist)' });
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

void eq;
