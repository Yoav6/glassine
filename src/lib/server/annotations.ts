import { and, eq, or } from 'drizzle-orm';
import { buildSelector } from '$lib/anchor';
import { suggestionQuotesTouch } from '$lib/editor/extract';
import { parseMarkdown } from '$lib/md';
import { db } from './db';
import { annotation } from './db/schema';
import { newId } from './crypto';
import type { ExtractedSuggestion } from '$lib/editor';

export function insertSuggestions(
	documentId: string,
	authorId: string,
	baseVersion: number,
	source: string,
	extracted: ExtractedSuggestion[]
) {
	const now = new Date();
	for (const item of extracted) {
		const existing = db.select().from(annotation).where(eq(annotation.id, item.id)).get();
		if (existing) {
			if (
				existing.documentId !== documentId ||
				existing.authorId !== authorId ||
				existing.type !== 'suggestion' ||
				existing.status !== 'open'
			) {
				continue;
			}
			writeSuggestionQuote(existing.id, item, now);
			continue;
		}

		const foldInto = overlappingOwnSuggestion(documentId, authorId, source, item);
		if (foldInto) {
			writeSuggestionQuote(foldInto.id, item, now);
			continue;
		}

		db.insert(annotation)
			.values({
				id: item.id,
				documentId,
				authorId,
				type: 'suggestion',
				parentId: null,
				body: null,
				replacement: item.replacement,
				exact: item.exact,
				prefix: item.prefix,
				suffix: item.suffix,
				offsetHint: item.offsetHint,
				headingPath: item.headingPath,
				paraOrdinal: item.paraOrdinal,
				visibility: 'own',
				status: 'open',
				detached: false,
				baseVersionSeen: baseVersion,
				createdAt: now,
				updatedAt: now
			})
			.run();
	}
}

function writeSuggestionQuote(id: string, item: ExtractedSuggestion, now: Date) {
	db.update(annotation)
		.set({
			replacement: item.replacement,
			exact: item.exact,
			prefix: item.prefix,
			suffix: item.suffix,
			offsetHint: item.offsetHint,
			headingPath: item.headingPath,
			paraOrdinal: item.paraOrdinal,
			detached: false,
			updatedAt: now
		})
		.where(eq(annotation.id, id))
		.run();
}

function overlappingOwnSuggestion(
	documentId: string,
	authorId: string,
	source: string,
	item: ExtractedSuggestion
) {
	const open = db
		.select()
		.from(annotation)
		.where(
			and(
				eq(annotation.documentId, documentId),
				eq(annotation.authorId, authorId),
				eq(annotation.type, 'suggestion'),
				eq(annotation.status, 'open')
			)
		)
		.all();
	return (
		open.find((row) => suggestionQuotesTouch(source, item, row)) ?? null
	);
}

export function insertComment(opts: {
	documentId: string;
	authorId: string;
	baseVersion: number;
	source: string;
	start: number;
	end: number;
	body: string;
	parentId?: string | null;
}) {
	const parsed = parseMarkdown(opts.source);
	const hint = parsed.hintsAt(opts.start);
	const selector = buildSelector(opts.source, opts.start, opts.end, hint);
	const now = new Date();
	const id = newId();
	db.insert(annotation)
		.values({
			id,
			documentId: opts.documentId,
			authorId: opts.authorId,
			type: 'comment',
			parentId: opts.parentId ?? null,
			body: opts.body,
			replacement: null,
			exact: selector.exact,
			prefix: selector.prefix,
			suffix: selector.suffix,
			offsetHint: selector.offsetHint,
			headingPath: selector.headingPath,
			paraOrdinal: selector.paraOrdinal,
			visibility: 'own',
			status: 'open',
			detached: false,
			baseVersionSeen: opts.baseVersion,
			createdAt: now,
			updatedAt: now
		})
		.run();
	return id;
}

export function insertReply(opts: {
	documentId: string;
	authorId: string;
	parentId: string;
	body: string;
}) {
	const parent = annotationById(opts.parentId);
	if (!parent || parent.documentId !== opts.documentId) return null;
	const now = new Date();
	const id = newId();
	db.insert(annotation)
		.values({
			id,
			documentId: opts.documentId,
			authorId: opts.authorId,
			type: 'comment',
			parentId: parent.id,
			body: opts.body,
			replacement: null,
			exact: parent.exact,
			prefix: parent.prefix,
			suffix: parent.suffix,
			offsetHint: parent.offsetHint,
			headingPath: parent.headingPath,
			paraOrdinal: parent.paraOrdinal,
			visibility: 'own',
			status: parent.status,
			detached: parent.detached,
			baseVersionSeen: parent.baseVersionSeen,
			createdAt: now,
			updatedAt: now
		})
		.run();
	return id;
}

export function setAnnotationStatus(id: string, status: 'rejected' | 'accepted' | 'open' | 'resolved') {
	db.update(annotation)
		.set({ status, updatedAt: new Date() })
		.where(eq(annotation.id, id))
		.run();
}

export function setThreadResolved(threadId: string, resolved: boolean) {
	const root = annotationById(threadId);
	if (!root) return [];
	const now = new Date();
	const status = resolved ? 'resolved' : 'open';
	const rows = db
		.select()
		.from(annotation)
		.where(or(eq(annotation.id, threadId), eq(annotation.parentId, threadId)))
		.all();
	const changed: string[] = [];
	for (const row of rows) {
		if (row.type !== 'comment') continue;
		if (resolved && row.status === 'resolved') continue;
		if (!resolved && row.status !== 'resolved') continue;
		db.update(annotation)
			.set({ status, updatedAt: now })
			.where(eq(annotation.id, row.id))
			.run();
		changed.push(row.id);
	}
	return changed;
}

export function reattachAnnotation(id: string, source: string, start: number, end: number) {
	const parsed = parseMarkdown(source);
	const hint = parsed.hintsAt(start);
	const selector = buildSelector(source, start, end, hint);
	db.update(annotation)
		.set({
			...selector,
			detached: false,
			updatedAt: new Date()
		})
		.where(eq(annotation.id, id))
		.run();
}

export function annotationById(id: string) {
	return db.select().from(annotation).where(eq(annotation.id, id)).get();
}

/** Lifecycle still needs a quote: open comments/suggestions and resolved comments. */
export function tracksQuote(row: { status: string }) {
	return row.status === 'open' || row.status === 'resolved';
}

export { and, or };
