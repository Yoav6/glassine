import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentBySlug, canOpenDocument, annotationsForViewer } from '$lib/server/visibility';
import { insertSuggestions, insertComment, insertReply, reattachAnnotation, annotationById } from '$lib/server/annotations';
import { readArticle } from '$lib/server/write';
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
	const source = readArticle(doc.relativePath);
	if (Array.isArray(body.suggestions)) {
		insertSuggestions(doc.id, user.id, doc.baseVersion, source, body.suggestions);
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
			insertComment({
				documentId: doc.id,
				authorId: user.id,
				baseVersion: doc.baseVersion,
				source,
				start: body.comment.start,
				end: body.comment.end,
				body: body.comment.body,
				parentId: null
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
	const source = readArticle(doc.relativePath);
	const row = annotationById(String(body.id));
	if (!row || row.documentId !== doc.id) error(404, 'Not found');
	reattachAnnotation(row.id, source, Number(body.start), Number(body.end));
	return json({ ok: true });
};
