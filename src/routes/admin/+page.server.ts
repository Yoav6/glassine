import { fail } from '@sveltejs/kit';
import { requireAuthor } from '$lib/server/guard';
import { listDocuments, createDocumentFromUpload, deleteDocument } from '$lib/server/documents';
import { db } from '$lib/server/db';
import { annotation } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireAuthor(event);
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
		const doc = createDocumentFromUpload(file.name, content, user.id);
		return { uploaded: doc.slug };
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
