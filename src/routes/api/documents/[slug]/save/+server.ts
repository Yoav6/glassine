import { error, json } from '@sveltejs/kit';
import { applySubstitutions } from '$lib/anchor';
import { requireAuthor } from '$lib/server/guard';
import { documentBySlug } from '$lib/server/visibility';
import { commitWrite, readDocument } from '$lib/server/write';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const user = requireAuthor(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	const body = await event.request.json();
	const source = readDocument(doc.relativePath);
	try {
		const next =
			typeof body.content === 'string'
				? body.content
				: applySubstitutions(source, body.substitutions ?? []).source;
		if (next === source) return json({ version: doc.baseVersion });
		const result = await commitWrite({
			documentId: doc.id,
			content: next,
			source: 'edit',
			actorId: user.id
		});
		return json(result);
	} catch (err) {
		return json({ message: err instanceof Error ? err.message : 'Save failed' }, { status: 409 });
	}
};
