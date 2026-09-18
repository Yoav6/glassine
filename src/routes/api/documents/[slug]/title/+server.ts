import { error, json } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { documentBySlug } from '$lib/server/visibility';
import { applyDisplayTitle } from '$lib/server/write';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const user = requireAuthor(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	const body = await event.request.json();
	const title = String(body.title ?? '').replace(/\s+/g, ' ').trim();
	if (!title) return json({ message: 'Title is required' }, { status: 400 });
	try {
		const result = await applyDisplayTitle({
			documentId: doc.id,
			title,
			actorId: user.id
		});
		return json(result);
	} catch (err) {
		return json({ message: err instanceof Error ? err.message : 'Title update failed' }, { status: 409 });
	}
};
