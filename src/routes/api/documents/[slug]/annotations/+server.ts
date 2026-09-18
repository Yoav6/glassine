import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentBySlug, canOpenDocument, annotationsForViewer } from '$lib/server/visibility';
import { insertSuggestions, insertComment, insertReply, reattachAnnotation, annotationById } from '$lib/server/annotations';
import { readDocument } from '$lib/server/write';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	return json({ annotations: annotationsForViewer(doc.id, user) });
};

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	const body = await event.request.json();
	const source = readDocument(doc.relativePath);
	if (Array.isArray(body.suggestions)) {
		insertSuggestions(doc.id, user.id, doc.baseVersion, source, body.suggestions, doc.title);
	}
	if (body.comment) {
		if (body.comment.parentId) {
			insertReply({
				documentId: doc.id,
				authorId: user.id,
				parentId: String(body.comment.parentId),
				body: String(body.comment.body ?? '')
			});
		} else {
			const onTitle = Boolean(body.comment.displayTitle);
			insertComment({
				documentId: doc.id,
				authorId: user.id,
				baseVersion: doc.baseVersion,
				source: onTitle ? doc.title : source,
				start: body.comment.start,
				end: body.comment.end,
				body: body.comment.body,
				parentId: null,
				displayTitle: onTitle
			});
		}
	}
	return json({ ok: true });
};

export const PATCH: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	const body = await event.request.json();
	const source = readDocument(doc.relativePath);
	const row = annotationById(String(body.id));
	if (!row || row.documentId !== doc.id) error(404, 'Not found');
	const onTitle = Boolean(body.displayTitle);
	reattachAnnotation(row.id, onTitle ? doc.title : source, Number(body.start), Number(body.end), onTitle);
	return json({ ok: true });
};
