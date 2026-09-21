import { eq } from 'drizzle-orm';
import { db } from './db';
import { document, documentVersion, grant } from './db/schema';
import { newId } from './crypto';
import { withDocumentLock } from './locks';
import { maybeGitCommit, maybeGitRemove } from './git';
import {
	slugify,
	uniqueSlug,
	uniqueRelativePath,
	titleFromMarkdown,
	writeDocument,
	readDocument,
	removeDocumentFile,
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

export async function createDocumentFromUpload(filename: string, content: string, actorId: string) {
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
	// Same message shape as commitWrite's, so the log reads `upload: <slug> v1`.
	await maybeGitCommit(relativePath, `upload: ${base} v1`);
	return documentWithTitle(db.select().from(document).where(eq(document.id, id)).get()!);
}

export function loadDocumentSource(slug: string) {
	const doc = db.select().from(document).where(eq(document.slug, slug)).get();
	if (!doc) return null;
	return { doc: documentWithTitle(doc), content: readDocument(doc.relativePath) };
}

export async function deleteDocument(slug: string): Promise<boolean> {
	const doc = db.select().from(document).where(eq(document.slug, slug)).get();
	if (!doc) return false;
	await withDocumentLock(doc.id, async () => {
		const current = db.select().from(document).where(eq(document.id, doc.id)).get();
		if (!current) return;
		await maybeGitRemove(current.relativePath, `delete: ${current.slug}`);
		removeDocumentFile(current.relativePath);
		db.delete(document).where(eq(document.id, current.id)).run();
	});
	return true;
}

export { readDocument };
