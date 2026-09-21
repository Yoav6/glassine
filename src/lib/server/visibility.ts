import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from './db';
import { annotation, document, grant, user } from './db/schema';
import { parseScope, visibleAuthorIds } from '../access';
import type { AppUser } from './guard';
import { documentWithTitle } from './write';

function grantFor(documentId: string, viewerId: string) {
	return db
		.select()
		.from(grant)
		.where(and(eq(grant.documentId, documentId), eq(grant.reviewerId, viewerId)))
		.get();
}

/** Ids of the users whose annotations the viewer may see and interact with; null without access. */
export function visibleAuthorIdsForViewer(documentId: string, viewer: AppUser): Set<string> | null {
	const users = db.select({ id: user.id, role: user.role }).from(user).all();
	if (viewer.role === 'author') return new Set(users.map((row) => row.id));
	const g = grantFor(documentId, viewer.id);
	if (!g) return null;
	return visibleAuthorIds(parseScope(g.visibilityScope), viewer.id, users);
}

export function annotationsForViewer(documentId: string, viewer: AppUser) {
	if (viewer.role === 'author') {
		return db.select().from(annotation).where(eq(annotation.documentId, documentId)).all();
	}
	const ids = visibleAuthorIdsForViewer(documentId, viewer);
	if (!ids) return [];
	return db
		.select()
		.from(annotation)
		.where(and(eq(annotation.documentId, documentId), inArray(annotation.authorId, [...ids])))
		.all();
}

export function canViewAnnotation(documentId: string, viewer: AppUser, row: { authorId: string }) {
	return visibleAuthorIdsForViewer(documentId, viewer)?.has(row.authorId) ?? false;
}

/** The people a viewer may pick from in their Annotations menu. */
export function annotationSourcesForViewer(documentId: string, viewer: AppUser) {
	const ids = visibleAuthorIdsForViewer(documentId, viewer);
	if (!ids) return [];
	return db
		.select({ id: user.id, name: user.name, role: user.role })
		.from(user)
		.where(inArray(user.id, [...ids]))
		.all()
		.map((row) => ({ id: row.id, name: row.name, role: row.role as 'author' | 'reviewer' }));
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
