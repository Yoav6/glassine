import { error, json } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { documentBySlug } from '$lib/server/visibility';
import { setAnnotationStatus } from '$lib/server/annotations';
import { annotationById } from '$lib/server/annotations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireAuthor(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	const body = await event.request.json();
	const row = annotationById(String(body.annotationId));
	if (!row || row.documentId !== doc.id) error(404, 'Not found');
	setAnnotationStatus(row.id, 'rejected');
	return json({ ok: true });
};
