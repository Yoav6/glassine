import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { gitSyncSecret } from '$lib/server/env';
import { gitPull } from '$lib/server/git';
import { db } from '$lib/server/db';
import { document } from '$lib/server/db/schema';
import { commitWrite, readDocument, slugify, uniqueSlug, titleFromMarkdown, writeDocument } from '$lib/server/write';
import { newId } from '$lib/server/crypto';
import { documentVersion } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const secret = gitSyncSecret();
	if (!secret) error(404, 'Git adapter off');
	const header = request.headers.get('x-glassine-sync') ?? '';
	if (header !== secret) error(401, 'Bad sync secret');
	const changed = await gitPull();
	const ingested: string[] = [];
	for (const relativePath of changed) {
		const content = readDocument(relativePath);
		const existing = db.select().from(document).where(eq(document.relativePath, relativePath)).get();
		if (existing) {
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
	return json({ ingested });
};
