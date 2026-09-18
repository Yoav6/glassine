import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { canOpenDocument, documentBySlug } from '$lib/server/visibility';
import { annotationById, setThreadResolved } from '$lib/server/annotations';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	const body = await event.request.json();
	const row = annotationById(String(body.threadId));
	if (!row || row.documentId !== doc.id) error(404, 'Not found');
	if (row.parentId) error(400, 'Resolve the thread, not a reply');
	const changed = setThreadResolved(row.id, body.resolved !== false);
	return json({ ok: true, ids: changed });
};
