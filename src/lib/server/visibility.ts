import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from './db';
import { annotation, document, grant, user } from './db/schema';
import type { AppUser } from './guard';
import { documentWithTitle } from './write';

export function annotationsForViewer(documentId: string, viewer: AppUser) {
	if (viewer.role === 'author') {
		return db.select().from(annotation).where(eq(annotation.documentId, documentId)).all();
	}
	const g = db
		.select()
		.from(grant)
		.where(and(eq(grant.documentId, documentId), eq(grant.reviewerId, viewer.id)))
		.get();
	if (!g) return [];
	if (g.visibilityScope === 'all') {
		return db.select().from(annotation).where(eq(annotation.documentId, documentId)).all();
	}
	if (g.visibilityScope === 'own' || !g.visibilityScope) {
		return db
			.select()
			.from(annotation)
			.where(and(eq(annotation.documentId, documentId), eq(annotation.authorId, viewer.id)))
			.all();
	}
	const ids = g.visibilityScope
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	ids.push(viewer.id);
	return db
		.select()
		.from(annotation)
		.where(and(eq(annotation.documentId, documentId), inArray(annotation.authorId, ids)))
		.all();
}

export function canOpenDocument(documentId: string, viewer: AppUser): boolean {
	if (viewer.role === 'author') return true;
	const g = db
		.select()
		.from(grant)
		.where(and(eq(grant.documentId, documentId), eq(grant.reviewerId, viewer.id)))
		.get();
	return Boolean(g);
}

export function documentBySlug(slug: string) {
	const doc = db.select().from(document).where(eq(document.slug, slug)).get();
	return doc ? documentWithTitle(doc) : undefined;
}

export function reviewerProfiles(): Map<string, { name: string; highlightColor: string | null }> {
	const rows = db.select({ id: user.id, name: user.name, highlightColor: user.highlightColor }).from(user).all();
	return new Map(rows.map((r) => [r.id, { name: r.name, highlightColor: r.highlightColor }]));
}

export function reviewerColors(): Map<string, string | null> {
	return new Map([...reviewerProfiles()].map(([id, profile]) => [id, profile.highlightColor]));
}

export { or };
