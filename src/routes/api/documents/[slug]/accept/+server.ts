import { error, json } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { documentBySlug } from '$lib/server/visibility';
import { acceptSuggestion } from '$lib/server/write';
import { notifyStatusChange } from '$lib/server/notify/create';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const user = requireAuthor(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	const body = await event.request.json();
	try {
		const result = await acceptSuggestion({
			documentId: doc.id,
			annotationId: String(body.annotationId),
			actorId: user.id,
			rejectOverlapping: Boolean(body.rejectOverlapping)
		});
		notifyStatusChange({
			documentId: doc.id,
			actorId: user.id,
			kind: 'accepted',
			annotationId: String(body.annotationId)
		});
		// Accepting one rewrite of a sentence rejects the others by construction.
		for (const id of result.overlapping) {
			notifyStatusChange({ documentId: doc.id, actorId: user.id, kind: 'rejected', annotationId: id });
		}
		return json(result);
	} catch (err) {
		return json({ message: err instanceof Error ? err.message : 'Accept failed' }, { status: 409 });
	}
};
