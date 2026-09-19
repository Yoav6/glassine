import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { document, documentVersion } from './db/schema';
import { newId } from './crypto';
import { gitPull } from './git';
import { commitWrite, readDocument, slugify, uniqueSlug, titleFromMarkdown, writeDocument } from './write';

export async function ingestGitUpdates(): Promise<string[]> {
	const changed = await gitPull();
	const ingested: string[] = [];
	for (const relativePath of changed) {
		const content = readDocument(relativePath);
		const existing = db.select().from(document).where(eq(document.relativePath, relativePath)).get();
		if (existing) {
			const latest = db
				.select()
				.from(documentVersion)
				.where(
					and(
						eq(documentVersion.documentId, existing.id),
						eq(documentVersion.version, existing.baseVersion)
					)
				)
				.get();
			if (latest?.content === content) continue;
			await commitWrite({
				documentId: existing.id,
				content,
				source: 'git',
				actorId: null
			});
			ingested.push(existing.slug);
			continue;
		}
		const now = new Date();
		const slug = uniqueSlug(slugify(relativePath));
		const id = newId();
		writeDocument(relativePath, content);
		db.insert(document)
			.values({
				id,
				slug,
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
				source: 'git',
				actorId: null,
				createdAt: now
			})
			.run();
		ingested.push(slug);
	}
	return ingested;
}

let ingestInFlight: Promise<string[]> | null = null;

/** Pull + ingest; never throw — used on page load when the hook may have missed Vite. */
export async function ingestGitUpdatesSafe(): Promise<string[]> {
	if (ingestInFlight) return ingestInFlight;
	ingestInFlight = ingestGitUpdates()
		.catch((err) => {
			console.warn('git adapter ingest skipped:', err);
			return [] as string[];
		})
		.finally(() => {
			ingestInFlight = null;
		});
	return ingestInFlight;
}
