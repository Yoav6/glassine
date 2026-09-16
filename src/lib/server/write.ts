import { eq } from 'drizzle-orm';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applySubstitution } from '$lib/anchor';
import { resolveSelector } from '$lib/anchor/resolve';
import { articlesDir } from './env';
import { db } from './db';
import { annotation, document, documentVersion } from './db/schema';
import { newId } from './crypto';
import { withDocumentLock } from './locks';
import { broadcast } from './sse';
import { maybeGitCommit } from './git';

export type WriteSource = 'upload' | 'edit' | 'accept' | 'git';

export function readArticle(relativePath: string): string {
	return readFileSync(join(articlesDir(), relativePath), 'utf8');
}

export function writeArticle(relativePath: string, content: string) {
	const path = join(articlesDir(), relativePath);
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
		writeArticle(doc.relativePath, opts.content);
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
			.set({ baseVersion: version, updatedAt: now })
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
		const source = readArticle(doc.relativePath);
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
		writeArticle(doc.relativePath, applied.source);
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
			.set({ baseVersion: version, updatedAt: now })
			.where(eq(document.id, doc.id))
			.run();
		rebaseAnnotations(doc.id, applied.source, version);
		broadcast(doc.id, 'base-moved', { version });
		await maybeGitCommit(doc.relativePath, `accept: ${doc.slug} v${version}`);
		return { version, overlapping };
	});
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
	return base || 'article';
}

export function uniqueSlug(base: string): string {
	let slug = base;
	let i = 2;
	while (db.select().from(document).where(eq(document.slug, slug)).get()) {
		slug = `${base}-${i++}`;
	}
	return slug;
}

export function titleFromMarkdown(content: string, fallback: string): string {
	const heading = content.match(/^#\s+(.+)$/m);
	return heading?.[1]?.trim() || fallback;
}
