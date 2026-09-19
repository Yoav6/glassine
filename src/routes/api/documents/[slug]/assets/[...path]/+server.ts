import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentBySlug, canOpenDocument } from '$lib/server/visibility';
import { assetSrcFromRoutePath } from '$lib/md/images';
import { readDocumentAsset } from '$lib/server/write';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');

	const rest = event.params.path;
	const segments = (Array.isArray(rest) ? rest : rest ? [rest] : []).filter(Boolean);
	if (!segments.length) error(404, 'Not found');

	let asset: ReturnType<typeof readDocumentAsset>;
	try {
		asset = readDocumentAsset(doc.relativePath, assetSrcFromRoutePath(segments));
	} catch {
		error(404, 'Not found');
	}
	if (!asset) error(404, 'Not found');

	return new Response(new Uint8Array(asset.body), {
		headers: {
			'Content-Type': asset.contentType,
			'Cache-Control': 'private, max-age=3600'
		}
	});
};
