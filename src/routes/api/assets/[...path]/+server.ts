import { error } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { readVaultAsset } from '$lib/server/assets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	requireAuthor(event);
	const segments = event.params.path?.split('/').filter(Boolean) ?? [];
	if (!segments.length) error(404, 'Not found');
	let relativePath: string;
	try {
		relativePath = segments.map((part) => decodeURIComponent(part)).join('/');
	} catch {
		error(400, 'Bad path');
	}
	const asset = readVaultAsset(relativePath!);
	if (!asset) error(404, 'Not found');
	const quoted = asset.fileName.replace(/"/g, '');
	return new Response(new Uint8Array(asset.body), {
		headers: {
			'Content-Type': asset.contentType,
			'Content-Disposition': `attachment; filename="${quoted}"; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`
		}
	});
};
