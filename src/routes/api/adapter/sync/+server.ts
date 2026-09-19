import { error, json } from '@sveltejs/kit';
import { gitSyncSecret } from '$lib/server/env';
import { ingestGitUpdates } from '$lib/server/git-ingest';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const secret = gitSyncSecret();
	if (!secret) error(404, 'Git adapter off');
	const header = request.headers.get('x-glassine-sync') ?? '';
	if (header !== secret) error(401, 'Bad sync secret');
	const ingested = await ingestGitUpdates();
	return json({ ingested });
};
