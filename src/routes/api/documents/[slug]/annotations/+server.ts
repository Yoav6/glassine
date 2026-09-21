import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import {
	documentBySlug,
	canOpenDocument,
	canViewAnnotation,
	annotationsForViewer
} from '$lib/server/visibility';
import { insertSuggestions, insertComment, insertReply, reattachAnnotation, annotationById, updateCommentBody } from '$lib/server/annotations';
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
			const parent = annotationById(String(body.comment.parentId));
			if (!parent || parent.documentId !== doc.id || !canViewAnnotation(doc.id, user, parent)) {
				error(404, 'Not found');
			}
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
	const row = annotationById(String(body.id));
	if (!row || row.documentId !== doc.id || !canViewAnnotation(doc.id, user, row)) {
		error(404, 'Not found');
	}
	if (user.role !== 'author' && row.authorId !== user.id) error(403, 'Forbidden');
	if (typeof body.body === 'string' && body.start == null && body.end == null) {
		const result = updateCommentBody(row.id, user.id, body.body);
		if (result === 'not-found') error(404, 'Not found');
		if (result === 'forbidden') error(403, 'Forbidden');
		if (result === 'empty') error(400, 'Comment cannot be empty');
		return json({ ok: true, body: String(body.body).trim() });
	}
	const source = readDocument(doc.relativePath);
	const onTitle = Boolean(body.displayTitle);
	reattachAnnotation(row.id, onTitle ? doc.title : source, Number(body.start), Number(body.end), onTitle);
	return json({ ok: true });
};
