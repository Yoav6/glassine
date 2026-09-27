import { error, json } from '@sveltejs/kit';
import { requireDevice } from '$lib/server/guard';
import { readVaultAsset, writeSyncAsset } from '$lib/server/assets';
import type { RequestHandler } from './$types';

function relativePathFromParams(rest: string | undefined): string {
	const segments = (rest ?? '').split('/').filter(Boolean);
	if (!segments.length) error(404, 'Not found');
	try {
		return segments.map((part) => decodeURIComponent(part)).join('/');
	} catch {
		error(400, 'Bad path');
	}
}

/** Pull: the current bytes of a vault-relative image path (see documentation/sync-api.md). */
export const GET: RequestHandler = async (event) => {
	requireDevice(event);
	const relativePath = relativePathFromParams(event.params.path);
	const asset = readVaultAsset(relativePath);
	if (!asset) error(404, 'Not found');
	return new Response(new Uint8Array(asset.body), {
		headers: { 'Content-Type': asset.contentType }
	});
};

/** Push: upsert an image at an exact vault-relative path — overwrites whatever is already there. */
export const POST: RequestHandler = async (event) => {
	requireDevice(event);
	const relativePath = relativePathFromParams(event.params.path);
	const body = Buffer.from(await event.request.arrayBuffer());
	try {
		await writeSyncAsset(relativePath, body);
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Could not save asset');
	}
	return json({ ok: true });
};
