import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { loadDocumentSource } from '$lib/server/documents';
import { annotationsForViewer, canOpenDocument } from '$lib/server/visibility';
import { reviewerColors } from '$lib/server/visibility';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const loaded = loadDocumentSource(event.params.slug);
	if (!loaded) error(404, 'Article not found');
	if (!canOpenDocument(loaded.doc.id, user)) error(403, 'No grant for this article');
	const colors = reviewerColors();
	const rows = annotationsForViewer(loaded.doc.id, user).map((row) => ({
		...row,
		highlightColor: colors.get(row.authorId) ?? null,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime()
	}));
	return {
		user,
		slug: loaded.doc.slug,
		title: loaded.doc.title,
		source: loaded.content,
		version: loaded.doc.baseVersion,
		annotations: rows
	};
};
