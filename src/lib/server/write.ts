import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { applySubstitution, invertSubstitution, retargetSelector, resolveSelector } from '$lib/anchor';
import { parseMarkdown } from '$lib/md';
import { imageContentType, resolveAssetRelativePath } from '$lib/md/images';
import { preservedMarkdownFileName, relativeMarkdownPath } from '$lib/filename';
import { deriveDocumentTitle, isDisplayTitleSelector, setYamlPropertyValue } from '$lib/title';
import { documentsDir } from './env';
import { db } from './db';
import { annotation, document, documentVersion } from './db/schema';
import { newId } from './crypto';
import { withDocumentLock } from './locks';
import { broadcast, docChannel } from './sse';
import { maybeGitCommit, maybeGitMove } from './git';
import { setThreadResolved, tracksQuote } from './annotations';
import { getTitleSettings } from './settings';

export type WriteSource = 'upload' | 'edit' | 'accept' | 'unaccept' | 'git' | 'sync';

export function readDocument(relativePath: string): string {
	return readFileSync(documentFilePath(relativePath), 'utf8');
}

export function writeDocument(relativePath: string, content: string) {
	const path = documentFilePath(relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, 'utf8');
}

export function removeDocumentFile(relativePath: string) {
	const path = documentFilePath(relativePath);
	if (existsSync(path)) unlinkSync(path);
}

/** Read a vault image referenced from a document. Null if missing or not an image. */
export function readDocumentAsset(
	documentRelativePath: string,
	src: string
): { body: Buffer; contentType: string } | null {
	const relative = resolveAssetRelativePath(documentRelativePath, src);
	if (!relative) return null;
	const contentType = imageContentType(relative);
	if (!contentType) return null;
	const path = documentFilePath(relative);
	if (!existsSync(path)) return null;
	return { body: readFileSync(path), contentType };
}

/** Absolute path under the documents vault, or throw if it escapes. */
export function vaultFilePath(relativePath: string): string {
	const root = resolve(documentsDir());
	const path = resolve(root, relativePath);
	const prefix = root.endsWith(sep) ? root : root + sep;
	if (path !== root && !path.startsWith(prefix)) throw new Error('Invalid document path');
	return path;
}

function documentFilePath(relativePath: string): string {
	return vaultFilePath(relativePath);
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
		broadcast(docChannel(doc.id), 'base-moved', { version });
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
		if (!row || row.type !== 'suggestion' || row.status !== 'open') {
			throw new Error('Suggestion not found');
		}
		const source = readDocument(doc.relativePath);
		if (isDisplayTitleSelector(row)) {
			const titleNow = titleFromMarkdown(source, doc.relativePath);
			const applied = applySubstitution(titleNow, {
				exact: row.exact,
				prefix: row.prefix,
				suffix: row.suffix,
				offsetHint: row.offsetHint,
				replacement: row.replacement ?? ''
			});
			const overlapping = findOverlapping(doc.id, row, titleNow);
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
			retargetLiveSelectors(
				doc.id,
				titleNow,
				applied.source,
				{
					start: applied.start,
					end: applied.start + row.exact.length,
					replacement: row.replacement ?? ''
				},
				row.id,
				true
			);
			const mutated = await mutateDisplayTitle({
				documentId: doc.id,
				title: applied.source,
				actorId: opts.actorId,
				writeSource: 'accept'
			});
			return { version: mutated.version, overlapping };
		}
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
		broadcast(docChannel(doc.id), 'base-moved', { version });
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
		if (isDisplayTitleSelector(row)) {
			const titleNow = titleFromMarkdown(source, doc.relativePath);
			const inverse = invertSubstitution({
				exact: row.exact,
				prefix: row.prefix,
				suffix: row.suffix,
				offsetHint: row.offsetHint,
				replacement: row.replacement ?? ''
			});
			const applied = applySubstitution(titleNow, inverse);
			retargetLiveSelectors(
				doc.id,
				titleNow,
				applied.source,
				{
					start: applied.start,
					end: applied.start + inverse.exact.length,
					replacement: inverse.replacement
				},
				row.id,
				true
			);
			const now = new Date();
			db.update(annotation)
				.set({ status: 'open', updatedAt: now })
				.where(eq(annotation.id, row.id))
				.run();
			setThreadResolved(row.id, false);
			reopenRejectedSuggestions(doc.id, opts.overlapping);
			const mutated = await mutateDisplayTitle({
				documentId: doc.id,
				title: applied.source,
				actorId: opts.actorId,
				writeSource: 'unaccept'
			});
			return { version: mutated.version };
		}
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
		broadcast(docChannel(doc.id), 'base-moved', { version });
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
	skipId: string,
	titleSpace = false
) {
	const parsed = parseMarkdown(newSource);
	const rows = db
		.select()
		.from(annotation)
		.where(eq(annotation.documentId, documentId))
		.all()
		.filter(
			(row) =>
				row.id !== skipId &&
				tracksQuote(row) &&
				isDisplayTitleSelector(row) === titleSpace
		);
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
	const doc = db.select().from(document).where(eq(document.id, documentId)).get();
	const title = doc ? titleFromMarkdown(source, doc.relativePath) : '';
	const rows = db
		.select()
		.from(annotation)
		.where(eq(annotation.documentId, documentId))
		.all()
		.filter(tracksQuote);
	const now = new Date();
	for (const row of rows) {
		const hay = isDisplayTitleSelector(row) ? title : source;
		const resolved = resolveSelector(hay, {
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
					detached: false,
					offsetHint: resolved.range.start,
					baseVersionSeen: version,
					updatedAt: now
				})
				.where(eq(annotation.id, row.id))
				.run();
		} else {
			db.update(annotation)
				.set({ detached: true, baseVersionSeen: version, updatedAt: now })
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
				row.status === 'open' &&
				isDisplayTitleSelector(row) === isDisplayTitleSelector(target)
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

export function uniqueRelativePath(filename: string, opts?: { except?: string }): string {
	const original = relativeMarkdownPath(filename);
	const stem = original.replace(/\.md$/i, '');
	let relativePath = original;
	let i = 2;
	while (relativePathTaken(relativePath, opts?.except)) {
		relativePath = `${stem} (${i++}).md`;
	}
	return relativePath;
}

export function relativePathTaken(relativePath: string, except?: string): boolean {
	if (except && relativePath === except) return false;
	try {
		if (existsSync(documentFilePath(relativePath))) return true;
	} catch {
		return true;
	}
	return Boolean(db.select().from(document).where(eq(document.relativePath, relativePath)).get());
}

/** Rename a hosted markdown file; URL slug stays the same. */
export async function renameDocumentFile(opts: {
	documentId: string;
	filename: string;
	actorId: string;
}): Promise<{ title: string; version: number; relativePath: string }> {
	return withDocumentLock(opts.documentId, async () => {
		const nextName = opts.filename.replace(/\s+/g, ' ').trim();
		if (!nextName) throw new Error('File name is required');
		const doc = db.select().from(document).where(eq(document.id, opts.documentId)).get();
		if (!doc) throw new Error('Document not found');
		const dir = dirname(doc.relativePath.replace(/\\/g, '/'));
		const file = preservedMarkdownFileName(nextName);
		const candidate = dir === '.' ? file : `${dir}/${file}`;
		const relativePath = uniqueRelativePath(candidate, { except: doc.relativePath });
		if (relativePath === doc.relativePath) {
			return {
				title: titleFromMarkdown(readDocument(doc.relativePath), doc.relativePath),
				version: doc.baseVersion,
				relativePath: doc.relativePath
			};
		}
		const from = documentFilePath(doc.relativePath);
		const to = documentFilePath(relativePath);
		mkdirSync(dirname(to), { recursive: true });
		renameSync(from, to);
		await maybeGitMove(doc.relativePath, relativePath, `rename: ${doc.slug}`);
		const content = readDocument(relativePath);
		const title = titleFromMarkdown(content, relativePath);
		const version = doc.baseVersion + 1;
		const now = new Date();
		db.insert(documentVersion)
			.values({
				id: newId(),
				documentId: doc.id,
				version,
				content,
				source: 'edit',
				actorId: opts.actorId,
				createdAt: now
			})
			.run();
		db.update(document)
			.set({
				relativePath,
				title,
				baseVersion: version,
				updatedAt: now
			})
			.where(eq(document.id, doc.id))
			.run();
		rebaseAnnotations(doc.id, content, version);
		broadcast(docChannel(doc.id), 'base-moved', { version });
		return { title, version, relativePath };
	});
}

export async function applyDisplayTitle(opts: {
	documentId: string;
	title: string;
	actorId: string;
	writeSource?: WriteSource;
}): Promise<{ title: string; version: number; source?: string; relativePath: string }> {
	return withDocumentLock(opts.documentId, () => mutateDisplayTitle(opts));
}

async function mutateDisplayTitle(opts: {
	documentId: string;
	title: string;
	actorId: string;
	writeSource?: WriteSource;
}): Promise<{ title: string; version: number; source?: string; relativePath: string }> {
	const nextTitle = opts.title.replace(/\s+/g, ' ').trim();
	if (!nextTitle) throw new Error('Title is required');
	const settings = getTitleSettings();
	if (settings.source === 'heading') throw new Error('Heading titles are edited in the document');
	const writeSource = opts.writeSource ?? 'edit';
	const doc = db.select().from(document).where(eq(document.id, opts.documentId)).get();
	if (!doc) throw new Error('Document not found');
	const originalContent = readDocument(doc.relativePath);
	let relativePath = doc.relativePath;
	let content = originalContent;
	const titleBefore = titleFromMarkdown(originalContent, doc.relativePath);

	if (settings.source === 'filename') {
		const dir = dirname(doc.relativePath.replace(/\\/g, '/'));
		const file = preservedMarkdownFileName(`${nextTitle}.md`);
		const candidate = dir === '.' ? file : `${dir}/${file}`;
		relativePath = uniqueRelativePath(candidate, { except: doc.relativePath });
		if (relativePath !== doc.relativePath) {
			const from = documentFilePath(doc.relativePath);
			const to = documentFilePath(relativePath);
			mkdirSync(dirname(to), { recursive: true });
			renameSync(from, to);
			await maybeGitMove(doc.relativePath, relativePath, `${writeSource}: ${doc.slug}`);
		}
	} else {
		content = setYamlPropertyValue(originalContent, settings.yamlProperty, nextTitle);
		if (content !== originalContent) {
			writeDocument(doc.relativePath, content);
			if (writeSource !== 'git') {
				await maybeGitCommit(doc.relativePath, `${writeSource}: ${doc.slug}`);
			}
		}
	}

	const title = titleFromMarkdown(content, relativePath);
	const contentChanged = content !== originalContent;
	const renamed = relativePath !== doc.relativePath;
	const titleChanged = title !== titleBefore;
	if (!contentChanged && !renamed && !titleChanged) {
		return {
			title,
			version: doc.baseVersion,
			source: settings.source === 'yaml' ? content : undefined,
			relativePath
		};
	}

	const now = new Date();
	const version = doc.baseVersion + (contentChanged || renamed ? 1 : 0);
	if (contentChanged || renamed) {
		db.insert(documentVersion)
			.values({
				id: newId(),
				documentId: doc.id,
				version,
				content,
				source: writeSource,
				actorId: opts.actorId,
				createdAt: now
			})
			.run();
	}
	db.update(document)
		.set({
			relativePath,
			title,
			updatedAt: now,
			...(contentChanged || renamed ? { baseVersion: version } : {})
		})
		.where(eq(document.id, doc.id))
		.run();
	if (contentChanged || renamed) {
		rebaseAnnotations(doc.id, content, version);
		broadcast(docChannel(doc.id), 'base-moved', { version });
	} else {
		rebaseAnnotations(doc.id, content, doc.baseVersion);
	}
	return {
		title,
		version: contentChanged || renamed ? version : doc.baseVersion,
		source: settings.source === 'yaml' ? content : undefined,
		relativePath
	};
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
