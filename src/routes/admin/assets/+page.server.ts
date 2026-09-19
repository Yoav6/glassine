import { fail } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { deleteAsset, listAssets, renameAsset, uploadAsset } from '$lib/server/assets';
import { ingestGitUpdatesSafe } from '$lib/server/git-ingest';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
	await ingestGitUpdatesSafe();
	return { user, assets: listAssets() };
};

export const actions: Actions = {
	upload: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || !file.name.trim()) {
			return fail(400, { message: 'Choose a file to upload' });
		}
		try {
			const { relativePath } = await uploadAsset(
				file.name,
				new Uint8Array(await file.arrayBuffer())
			);
			return { uploaded: relativePath };
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'Could not upload' });
		}
	},
	rename: async (event) => {
		const user = requireAuthor(event);
		const form = await event.request.formData();
		const path = form.get('path');
		const raw = form.get('filename');
		if (typeof path !== 'string' || !path) {
			return fail(400, { message: 'Missing asset' });
		}
		if (typeof raw !== 'string' || !raw.trim()) {
			return fail(400, { message: 'Enter a file name' });
		}
		try {
			await renameAsset({
				relativePath: path,
				filename: raw.trim(),
				actorId: user.id
			});
		} catch (err) {
			return fail(400, { message: err instanceof Error ? err.message : 'Could not rename' });
		}
		return { renamed: true };
	},
	delete: async (event) => {
		requireAuthor(event);
		const form = await event.request.formData();
		const path = form.get('path');
		if (typeof path !== 'string' || !path) {
			return fail(400, { message: 'Missing asset' });
		}
		const removed = await deleteAsset(path);
		if (!removed) return fail(404, { message: 'Asset not found' });
	}
};
