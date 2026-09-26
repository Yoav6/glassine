import { error, json } from '@sveltejs/kit';
import { requireDevice } from '$lib/server/guard';
import { documentBySlug } from '$lib/server/visibility';
import { commitWrite, readDocument } from '$lib/server/write';
import type { RequestHandler } from './$types';

/** Pull the current content + version of a document a client already knows the slug for. */
export const GET: RequestHandler = async (event) => {
	requireDevice(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	return json({ content: readDocument(doc.relativePath), version: doc.baseVersion });
};

/** Push new content for an existing document. Last write wins — no conflict detection. */
export const POST: RequestHandler = async (event) => {
	const author = requireDevice(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	const body = await event.request.json().catch(() => null);
	const content = typeof body?.content === 'string' ? body.content : null;
	if (content === null) error(400, 'content is required');
	if (content === readDocument(doc.relativePath)) return json({ version: doc.baseVersion });
	const result = await commitWrite({
		documentId: doc.id,
		content,
		source: 'sync',
		actorId: author.id
	});
	return json(result);
};
