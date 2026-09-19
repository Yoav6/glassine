import { error, fail } from '@sveltejs/kit';
import { requireAuthor, requireUser } from '$lib/server/guard';
import { loadDocumentSource } from '$lib/server/documents';
import { ingestGitUpdatesSafe } from '$lib/server/git-ingest';
import { getTitleSettings } from '$lib/server/settings';
import { DEFAULT_TITLE_SETTINGS } from '$lib/title';
import { annotationsForViewer, canOpenDocument, reviewerProfiles } from '$lib/server/visibility';
import { readInviteToken, redeemInviteAction } from '$lib/server/invite-landing';
import {
	grantedReviewerIds,
	inviteUrl,
	listReviewers,
	revokeGrant,
	rotateInvite,
	setGrant
} from '$lib/server/reviewers';
import type { Actions, PageServerLoad } from './$types';

function accessLists(documentId: string, role: string) {
	if (role !== 'author') return { reviewers: [], grantedReviewerIds: [] };
	return {
		reviewers: listReviewers().map((row) => ({ id: row.id, name: row.name })),
		grantedReviewerIds: grantedReviewerIds(documentId)
	};
}

function loadedDocument(event: { params: { slug: string } }) {
	const loaded = loadDocumentSource(event.params.slug);
	if (!loaded) error(404, 'Document not found');
	return loaded;
}

export const load: PageServerLoad = async (event) => {
	const token = readInviteToken(event.url);
	if (token) {
		return {
			inviteToken: token,
			user: null,
			slug: event.params.slug,
			title: '',
			titleSettings: DEFAULT_TITLE_SETTINGS,
			source: '',
			version: 0,
			annotations: [],
			reviewers: [],
			grantedReviewerIds: []
		};
	}
	const user = requireUser(event);
	await ingestGitUpdatesSafe();
	const loaded = loadedDocument(event);
	if (!canOpenDocument(loaded.doc.id, user)) error(403, 'No grant for this document');
	const profiles = reviewerProfiles();
	const rows = annotationsForViewer(loaded.doc.id, user).map((row) => {
		const profile = profiles.get(row.authorId);
		return {
			...row,
			highlightColor: profile?.highlightColor ?? null,
			authorName: profile?.name ?? 'Unknown',
			createdAt: row.createdAt.getTime(),
			updatedAt: row.updatedAt.getTime()
		};
	});
	return {
		inviteToken: null,
		user,
		slug: loaded.doc.slug,
		title: loaded.doc.title,
		titleSettings: getTitleSettings(),
		source: loaded.content,
		version: loaded.doc.baseVersion,
		annotations: rows,
		...accessLists(loaded.doc.id, user.role)
	};
};

export const actions: Actions = {
	default: (event) => redeemInviteAction(event, `/documents/${event.params.slug}`),
	grant: async (event) => {
		requireAuthor(event);
		const loaded = loadedDocument(event);
		const form = await event.request.formData();
		const reviewerId = String(form.get('reviewerId') ?? '');
		if (!listReviewers().some((row) => row.id === reviewerId)) {
			return fail(400, { message: 'Reviewer not found' });
		}
		setGrant(reviewerId, loaded.doc.id, String(form.get('visibilityScope') ?? 'own'));
		return { ok: true, reviewerId, granted: true };
	},
	revoke: async (event) => {
		requireAuthor(event);
		const loaded = loadedDocument(event);
		const form = await event.request.formData();
		const reviewerId = String(form.get('reviewerId') ?? '');
		if (!reviewerId) return fail(400, { message: 'Reviewer is required' });
		revokeGrant(reviewerId, loaded.doc.id);
		return { ok: true, reviewerId, granted: false };
	},
	copy: async (event) => {
		requireAuthor(event);
		loadedDocument(event);
		const form = await event.request.formData();
		const reviewerId = String(form.get('reviewerId') ?? '');
		if (!listReviewers().some((row) => row.id === reviewerId)) {
			return fail(400, { message: 'Reviewer not found' });
		}
		const token = rotateInvite(reviewerId);
		return { invite: inviteUrl(token, event.params.slug), reviewerId };
	}
};
