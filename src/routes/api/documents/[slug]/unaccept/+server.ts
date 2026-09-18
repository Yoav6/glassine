import { error, json } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { documentBySlug } from '$lib/server/visibility';
import { unacceptSuggestion } from '$lib/server/write';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const user = requireAuthor(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	const body = await event.request.json();
	const overlapping = Array.isArray(body.overlapping) ? body.overlapping.map(String) : [];
	try {
		const result = await unacceptSuggestion({
			documentId: doc.id,
			annotationId: String(body.annotationId),
			actorId: user.id,
			overlapping
		});
		return json(result);
	} catch (err) {
		return json({ message: err instanceof Error ? err.message : 'Unaccept failed' }, { status: 409 });
	}
};
