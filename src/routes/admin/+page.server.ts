import { fail } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { listDocuments, createDocumentFromUpload, deleteDocument } from '$lib/server/documents';
import { ingestGitUpdatesSafe } from '$lib/server/git-ingest';
import { preservedMarkdownFileName } from '$lib/filename';
import { db } from '$lib/server/db';
import { annotation } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { documentBySlug } from '$lib/server/visibility';
import { renameDocumentFile } from '$lib/server/write';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
	await ingestGitUpdatesSafe();
	const docs = listDocuments().map((doc) => {
		const rows = db.select().from(annotation).where(eq(annotation.documentId, doc.id)).all();
		const open = rows.filter((r) => r.status === 'open').length;
		return { ...doc, open };
	});
	return { user, docs };
};

export const actions: Actions = {
	upload: async (event) => {
		const user = requireAuthor(event);
		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || !file.name.endsWith('.md')) {
			return fail(400, { message: 'Upload a .md file' });
		}
		const content = await file.text();
		const doc = await createDocumentFromUpload(file.name, content, user.id);
		return { uploaded: doc.slug };
	},
	create: async (event) => {
		const user = requireAuthor(event);
		const form = await event.request.formData();
		const raw = form.get('filename');
		if (typeof raw !== 'string' || !raw.trim()) {
			return fail(400, { message: 'Enter a file name' });
		}
		const doc = await createDocumentFromUpload(preservedMarkdownFileName(raw.trim()), '', user.id);
		return { created: doc.slug };
	},
	rename: async (event) => {
		const user = requireAuthor(event);
		const form = await event.request.formData();
		const slug = form.get('slug');
		const raw = form.get('filename');
		if (typeof slug !== 'string' || !slug) {
			return fail(400, { message: 'Missing document' });
		}
		if (typeof raw !== 'string' || !raw.trim()) {
			return fail(400, { message: 'Enter a file name' });
		}
		const doc = documentBySlug(slug);
		if (!doc) return fail(404, { message: 'Document not found' });
		try {
			await renameDocumentFile({
				documentId: doc.id,
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
		const slug = form.get('slug');
		if (typeof slug !== 'string' || !slug) {
			return fail(400, { message: 'Missing document' });
		}
		const removed = await deleteDocument(slug);
		if (!removed) return fail(404, { message: 'Document not found' });
	}
};
