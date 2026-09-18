import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { loadDocumentSource } from '$lib/server/documents';
import { annotationsForViewer, canOpenDocument, reviewerProfiles } from '$lib/server/visibility';
import { readInviteToken, redeemInviteAction } from '$lib/server/invite-landing';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const token = readInviteToken(event.url);
	if (token) {
		return { inviteToken: token, user: null, slug: event.params.slug, title: '', source: '', version: 0, annotations: [] };
	}
	const user = requireUser(event);
	const loaded = loadDocumentSource(event.params.slug);
	if (!loaded) error(404, 'Document not found');
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
		source: loaded.content,
		version: loaded.doc.baseVersion,
		annotations: rows
	};
};

export const actions: Actions = {
	default: (event) => redeemInviteAction(event, `/documents/${event.params.slug}`)
};
