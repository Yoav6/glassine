import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentBySlug, canOpenDocument } from '$lib/server/visibility';
import { readArticle } from '$lib/server/write';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	const content = readArticle(doc.relativePath);
	return new Response(content, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="${doc.slug}.md"`
		}
	});
};
