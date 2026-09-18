import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applySubstitution, invertSubstitution, retargetSelector, resolveSelector } from '$lib/anchor';
import { parseMarkdown } from '$lib/md';
import { preservedMarkdownFileName } from '$lib/filename';
import { deriveDocumentTitle } from '$lib/title';
import { documentsDir } from './env';
import { db } from './db';
import { annotation, document, documentVersion } from './db/schema';
import { newId } from './crypto';
import { withDocumentLock } from './locks';
import { broadcast } from './sse';
import { maybeGitCommit } from './git';
import { setThreadResolved } from './annotations';
import { getTitleSettings } from './settings';

export type WriteSource = 'upload' | 'edit' | 'accept' | 'unaccept' | 'git';

export function readDocument(relativePath: string): string {
	return readFileSync(join(documentsDir(), relativePath), 'utf8');
}

export function writeDocument(relativePath: string, content: string) {
	const path = join(documentsDir(), relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf8');
}

export async function commitWrite(opts: {
	documentId: string;
	content: string;
	source: WriteSource;
	actorId: string | null;
}): Promise<{ version: number }> {
	return withDocumentLock(opts.documentId, async () => {
		const doc = db.select().from(document).where(eq(document.id, opts.documentId)).get();
		if (!doc) throw new Error('Document not found');
		writeDocument(doc.relativePath, opts.content);
		const version = doc.baseVersion + 1;
		const now = new Date();
		db.insert(documentVersion)
			.values({
				id: newId(),
				documentId: doc.id,
				version,
				content: opts.content,
				source: opts.source,
				actorId: opts.actorId,
				createdAt: now
			})
			.run();
		db.update(document)
			.set({
				baseVersion: version,
				updatedAt: now,
				title: titleFromMarkdown(opts.content, doc.relativePath)
			})
			.where(eq(document.id, doc.id))
			.run();
		rebaseAnnotations(doc.id, opts.content, version);
		broadcast(doc.id, 'base-moved', { version });
		if (opts.source !== 'git') {
			await maybeGitCommit(doc.relativePath, `${opts.source}: ${doc.slug} v${version}`);
		}
		return { version };
	});
}

export async function acceptSuggestion(opts: {
	documentId: string;
	annotationId: string;
	actorId: string;
	rejectOverlapping: boolean;
}): Promise<{ version: number; overlapping: string[] }> {
	return withDocumentLock(opts.documentId, async () => {
		const doc = db.select().from(document).where(eq(document.id, opts.documentId)).get();
		if (!doc) throw new Error('Document not found');
		const row = db.select().from(annotation).where(eq(annotation.id, opts.annotationId)).get();
		if (!row || row.type !== 'suggestion' || (row.status !== 'open' && row.status !== 'detached')) {
			throw new Error('Suggestion not found');
		}
		const source = readDocument(doc.relativePath);
		const applied = applySubstitution(source, {
			exact: row.exact,
			prefix: row.prefix,
			suffix: row.suffix,
			offsetHint: row.offsetHint,
			replacement: row.replacement ?? ''
		});
		const overlapping = findOverlapping(doc.id, row, source);
		if (opts.rejectOverlapping) {
			for (const id of overlapping) {
				db.update(annotation)
					.set({ status: 'rejected', updatedAt: new Date() })
					.where(eq(annotation.id, id))
					.run();
			}
		}
		db.update(annotation)
			.set({ status: 'accepted', updatedAt: new Date() })
			.where(eq(annotation.id, row.id))
			.run();
		setThreadResolved(row.id, true);
		retargetLiveSelectors(doc.id, source, applied.source, {
			start: applied.start,
			end: applied.start + row.exact.length,
			replacement: row.replacement ?? ''
		}, row.id);
		writeDocument(doc.relativePath, applied.source);
		const version = doc.baseVersion + 1;
		const now = new Date();
		db.insert(documentVersion)
			.values({
				id: newId(),
				documentId: doc.id,
				version,
				content: applied.source,
				source: 'accept',
				actorId: opts.actorId,
				createdAt: now
			})
			.run();
		db.update(document)
			.set({
				baseVersion: version,
				updatedAt: now,
				title: titleFromMarkdown(applied.source, doc.relativePath)
			})
			.where(eq(document.id, doc.id))
			.run();
		rebaseAnnotations(doc.id, applied.source, version);
		broadcast(doc.id, 'base-moved', { version });
		await maybeGitCommit(doc.relativePath, `accept: ${doc.slug} v${version}`);
		return { version, overlapping };
	});
}

export async function unacceptSuggestion(opts: {
	documentId: string;
	annotationId: string;
	actorId: string;
	overlapping: string[];
}): Promise<{ version: number }> {
	return withDocumentLock(opts.documentId, async () => {
		const doc = db.select().from(document).where(eq(document.id, opts.documentId)).get();
		if (!doc) throw new Error('Document not found');
		const row = db.select().from(annotation).where(eq(annotation.id, opts.annotationId)).get();
		if (!row || row.type !== 'suggestion' || row.status !== 'accepted') {
			throw new Error('Accepted suggestion not found');
		}
		const source = readDocument(doc.relativePath);
		const inverse = invertSubstitution({
			exact: row.exact,
			prefix: row.prefix,
			suffix: row.suffix,
			offsetHint: row.offsetHint,
			replacement: row.replacement ?? ''
		});
		const applied = applySubstitution(source, inverse);
		retargetLiveSelectors(
			doc.id,
			source,
			applied.source,
			{
				start: applied.start,
				end: applied.start + inverse.exact.length,
				replacement: inverse.replacement
			},
			row.id
		);
		const now = new Date();
		db.update(annotation)
			.set({ status: 'open', updatedAt: now })
			.where(eq(annotation.id, row.id))
			.run();
		setThreadResolved(row.id, false);
		reopenRejectedSuggestions(doc.id, opts.overlapping);
		writeDocument(doc.relativePath, applied.source);
		const version = doc.baseVersion + 1;
		db.insert(documentVersion)
			.values({
				id: newId(),
				documentId: doc.id,
				version,
				content: applied.source,
				source: 'unaccept',
				actorId: opts.actorId,
				createdAt: now
			})
			.run();
		db.update(document)
			.set({
				baseVersion: version,
				updatedAt: now,
				title: titleFromMarkdown(applied.source, doc.relativePath)
			})
			.where(eq(document.id, doc.id))
			.run();
		rebaseAnnotations(doc.id, applied.source, version);
		broadcast(doc.id, 'base-moved', { version });
		await maybeGitCommit(doc.relativePath, `unaccept: ${doc.slug} v${version}`);
		return { version };
	});
}

function reopenRejectedSuggestions(documentId: string, ids: string[]) {
	const now = new Date();
	for (const id of ids) {
		const row = db.select().from(annotation).where(eq(annotation.id, id)).get();
		if (!row || row.documentId !== documentId || row.type !== 'suggestion') continue;
		if (row.status !== 'rejected') continue;
		db.update(annotation)
			.set({ status: 'open', updatedAt: now })
			.where(eq(annotation.id, id))
			.run();
	}
}

function retargetLiveSelectors(
	documentId: string,
	oldSource: string,
	newSource: string,
	splice: { start: number; end: number; replacement: string },
	skipId: string
) {
	const parsed = parseMarkdown(newSource);
	const rows = db
		.select()
		.from(annotation)
		.where(eq(annotation.documentId, documentId))
		.all()
		.filter((row) => row.id !== skipId && (row.status === 'open' || row.status === 'detached'));
	const now = new Date();
	for (const row of rows) {
		const next = retargetSelector(
			{
				exact: row.exact,
				prefix: row.prefix,
				suffix: row.suffix,
				offsetHint: row.offsetHint,
				headingPath: row.headingPath,
				paraOrdinal: row.paraOrdinal
			},
			oldSource,
			newSource,
			splice,
			(offset) => parsed.hintsAt(offset)
		);
		if (!next) continue;
		db.update(annotation)
			.set({
				exact: next.exact,
				prefix: next.prefix,
				suffix: next.suffix,
				offsetHint: next.offsetHint,
				headingPath: next.headingPath,
				paraOrdinal: next.paraOrdinal,
				updatedAt: now
			})
			.where(eq(annotation.id, row.id))
			.run();
	}
}

export function rebaseAnnotations(documentId: string, source: string, version: number) {
	const rows = db
		.select()
		.from(annotation)
		.where(eq(annotation.documentId, documentId))
		.all()
		.filter((row) => row.status === 'open' || row.status === 'detached');
	const now = new Date();
	for (const row of rows) {
		if (row.status === 'accepted' || row.status === 'rejected') continue;
		const resolved = resolveSelector(source, {
			exact: row.exact,
			prefix: row.prefix,
			suffix: row.suffix,
			offsetHint: row.offsetHint,
			headingPath: row.headingPath,
			paraOrdinal: row.paraOrdinal
		});
		if (resolved.status === 'resolved') {
			db.update(annotation)
				.set({
					status: 'open',
					offsetHint: resolved.range.start,
					baseVersionSeen: version,
					updatedAt: now
				})
				.where(eq(annotation.id, row.id))
				.run();
		} else {
			db.update(annotation)
				.set({ status: 'detached', baseVersionSeen: version, updatedAt: now })
				.where(eq(annotation.id, row.id))
				.run();
		}
	}
}

function findOverlapping(
	documentId: string,
	target: typeof annotation.$inferSelect,
	source: string
): string[] {
	const targetResolved = resolveSelector(source, {
		exact: target.exact,
		prefix: target.prefix,
		suffix: target.suffix,
		offsetHint: target.offsetHint,
		headingPath: target.headingPath,
		paraOrdinal: target.paraOrdinal
	});
	if (targetResolved.status !== 'resolved') return [];
	const { start, end } = targetResolved.range;
	const others = db
		.select()
		.from(annotation)
		.where(eq(annotation.documentId, documentId))
		.all()
		.filter(
			(row) =>
				row.id !== target.id &&
				row.type === 'suggestion' &&
				(row.status === 'open' || row.status === 'detached')
		);
	const ids: string[] = [];
	for (const row of others) {
		const resolved = resolveSelector(source, {
			exact: row.exact,
			prefix: row.prefix,
			suffix: row.suffix,
			offsetHint: row.offsetHint,
			headingPath: row.headingPath,
			paraOrdinal: row.paraOrdinal
		});
		if (resolved.status !== 'resolved') continue;
		if (resolved.range.start < end && start < resolved.range.end) ids.push(row.id);
	}
	return ids;
}

export function slugify(name: string): string {
	const base = name
		.replace(/\.md$/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return base || 'document';
}

export function uniqueSlug(base: string): string {
	let slug = base;
	let i = 2;
	while (db.select().from(document).where(eq(document.slug, slug)).get()) {
		slug = `${base}-${i++}`;
	}
	return slug;
}

export function uniqueRelativePath(filename: string): string {
	const original = preservedMarkdownFileName(filename);
	const stem = original.replace(/\.md$/i, '');
	let relativePath = original;
	let i = 2;
	while (relativePathTaken(relativePath)) {
		relativePath = `${stem} (${i++}).md`;
	}
	return relativePath;
}

function relativePathTaken(relativePath: string): boolean {
	if (existsSync(join(documentsDir(), relativePath))) return true;
	return Boolean(db.select().from(document).where(eq(document.relativePath, relativePath)).get());
}

export function titleFromMarkdown(content: string, relativePath: string): string {
	return deriveDocumentTitle(content, relativePath, getTitleSettings());
}

export function documentWithTitle<T extends { relativePath: string; title: string }>(doc: T): T {
	return {
		...doc,
		title: titleFromMarkdown(readDocument(doc.relativePath), doc.relativePath)
	};
}

export function refreshDocumentTitles() {
	const docs = db.select().from(document).all();
	for (const doc of docs) {
		const title = titleFromMarkdown(readDocument(doc.relativePath), doc.relativePath);
		if (title === doc.title) continue;
		db.update(document).set({ title }).where(eq(document.id, doc.id)).run();
	}
}
