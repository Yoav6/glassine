import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { canOpenDocument, canViewAnnotation, documentBySlug } from '$lib/server/visibility';
import { annotationById, hasReplies, setThreadResolved } from '$lib/server/annotations';
import { notifyStatusChange } from '$lib/server/notify/create';
import { broadcast, docChannel } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	const body = await event.request.json();
	const row = annotationById(String(body.threadId));
	if (!row || row.documentId !== doc.id || !canViewAnnotation(doc.id, user, row)) {
		error(404, 'Not found');
	}
	if (row.parentId) error(400, 'Resolve the thread, not a reply');
	// Reviewers may retract their own threads, never someone else's.
	if (user.role !== 'author' && row.authorId !== user.id) error(403, 'Forbidden');
	const resolved = body.resolved !== false;
	// A reviewer's retraction only stands while nobody has replied; reopening their own is always fine.
	if (resolved && user.role !== 'author' && hasReplies(row.id)) {
		error(403, 'A thread that has been replied to cannot be retracted');
	}
	const changed = setThreadResolved(row.id, resolved);
	// Reopening a thread is not news; only the resolve is.
	if (resolved && changed.length) {
		notifyStatusChange({
			documentId: doc.id,
			actorId: user.id,
			kind: 'resolved',
			annotationId: row.id
		});
	}
	if (changed.length) broadcast(docChannel(doc.id), 'annotation-changed', {});
	return json({ ok: true, ids: changed });
};
