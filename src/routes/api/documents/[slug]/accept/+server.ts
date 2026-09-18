import { error, json } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { documentBySlug } from '$lib/server/visibility';
import { acceptSuggestion } from '$lib/server/write';
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
		return json(result);
	} catch (err) {
		return json({ message: err instanceof Error ? err.message : 'Accept failed' }, { status: 409 });
	}
};
