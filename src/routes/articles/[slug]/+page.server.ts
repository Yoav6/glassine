import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { loadDocumentSource } from '$lib/server/documents';
import { annotationsForViewer, canOpenDocument, reviewerProfiles } from '$lib/server/visibility';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const loaded = loadDocumentSource(event.params.slug);
	if (!loaded) error(404, 'Article not found');
	if (!canOpenDocument(loaded.doc.id, user)) error(403, 'No grant for this article');
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
		user,
		slug: loaded.doc.slug,
		title: loaded.doc.title,
		source: loaded.content,
		version: loaded.doc.baseVersion,
		annotations: rows
	};
};
