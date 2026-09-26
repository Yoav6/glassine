import { error, json } from '@sveltejs/kit';
import { requireDevice } from '$lib/server/guard';
import { listDocuments, createDocumentFromUpload } from '$lib/server/documents';
import { publicOrigin } from '$lib/server/env';
import type { RequestHandler } from './$types';

function documentUrl(slug: string): string {
	return `${publicOrigin()}/documents/${encodeURIComponent(slug)}`;
}

/** List every document, so a client can match its own files to existing ones by URL. */
export const GET: RequestHandler = async (event) => {
	requireDevice(event);
	const docs = listDocuments().map((doc) => ({
		slug: doc.slug,
		relativePath: doc.relativePath,
		title: doc.title,
		version: doc.baseVersion,
		url: documentUrl(doc.slug)
	}));
	return json({ documents: docs });
};

/** Create a new document from a client-side file that has no matching Glassine document yet. */
export const POST: RequestHandler = async (event) => {
	const author = requireDevice(event);
	const body = await event.request.json().catch(() => null);
	const filename = typeof body?.filename === 'string' ? body.filename : '';
	const content = typeof body?.content === 'string' ? body.content : '';
	if (!filename.trim()) error(400, 'filename is required');
	const doc = await createDocumentFromUpload(filename, content, author.id, 'sync');
	return json({ slug: doc.slug, version: doc.baseVersion, url: documentUrl(doc.slug) });
};
