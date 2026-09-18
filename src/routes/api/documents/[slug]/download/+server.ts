import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentBySlug, canOpenDocument } from '$lib/server/visibility';
import { downloadFileName } from '$lib/filename';
import { readDocument } from '$lib/server/write';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');
	const content = readDocument(doc.relativePath);
	const name = downloadFileName(doc.relativePath);
	const quoted = name.replace(/"/g, '');
	return new Response(content, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Content-Disposition': `attachment; filename="${quoted}"; filename*=UTF-8''${encodeURIComponent(name)}`
		}
	});
};
