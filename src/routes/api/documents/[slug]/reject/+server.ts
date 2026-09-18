import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { canOpenDocument, documentBySlug } from '$lib/server/visibility';
import { annotationById, setAnnotationStatus, setThreadResolved } from '$lib/server/annotations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	const body = await event.request.json();
	const row = annotationById(String(body.annotationId));
	if (!row || row.documentId !== doc.id || row.type !== 'suggestion') error(404, 'Not found');
	if (row.status !== 'open' && row.status !== 'detached') error(409, 'Suggestion is not open');
	if (user.role !== 'author' && row.authorId !== user.id) error(403, 'Forbidden');
	setAnnotationStatus(row.id, 'rejected');
	setThreadResolved(row.id, true);
	return json({ ok: true });
};
