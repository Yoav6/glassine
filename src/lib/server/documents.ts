import { eq } from 'drizzle-orm';
import { db } from './db';
import { document, documentVersion, grant } from './db/schema';
import { newId } from './crypto';
import {
	slugify,
	uniqueSlug,
	uniqueRelativePath,
	titleFromMarkdown,
	writeDocument,
	readDocument,
	documentWithTitle
} from './write';

export function listDocuments() {
	return db.select().from(document).all().map(documentWithTitle);
}

export function documentsForReviewer(reviewerId: string) {
	const grants = db.select().from(grant).where(eq(grant.reviewerId, reviewerId)).all();
	if (!grants.length) return [];
	const docs = listDocuments();
	const allowed = new Set(grants.map((g) => g.documentId));
	return docs.filter((d) => allowed.has(d.id));
}

export function createDocumentFromUpload(filename: string, content: string, actorId: string) {
	const relativePath = uniqueRelativePath(filename);
	const base = uniqueSlug(slugify(filename));
	const now = new Date();
	const id = newId();
	writeDocument(relativePath, content);
	db.insert(document)
		.values({
			id,
			slug: base,
			title: titleFromMarkdown(content, relativePath),
			relativePath,
			baseVersion: 1,
			createdAt: now,
			updatedAt: now
		})
		.run();
	db.insert(documentVersion)
		.values({
			id: newId(),
			documentId: id,
			version: 1,
			content,
			source: 'upload',
			actorId,
			createdAt: now
		})
		.run();
	return documentWithTitle(db.select().from(document).where(eq(document.id, id)).get()!);
}

export function loadDocumentSource(slug: string) {
	const doc = db.select().from(document).where(eq(document.slug, slug)).get();
	if (!doc) return null;
	return { doc: documentWithTitle(doc), content: readDocument(doc.relativePath) };
}

export { readDocument };
