import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { documentBySlug, canOpenDocument } from '$lib/server/visibility';
import { subscribe } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	const doc = documentBySlug(event.params.slug);
	if (!doc) error(404, 'Not found');
	if (!canOpenDocument(doc.id, user)) error(403, 'Forbidden');

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let ping: ReturnType<typeof setInterval> | undefined;
			let unsub: (() => void) | undefined;
			const shutdown = () => {
				if (closed) return;
				closed = true;
				if (ping) clearInterval(ping);
				unsub?.();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};
			const send = (eventName: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(
						encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
					);
				} catch {
					shutdown();
				}
			};
			send('hello', { version: doc.baseVersion });
			unsub = subscribe(doc.id, send);
			ping = setInterval(() => send('ping', { t: Date.now() }), 25000);
			event.request.signal.addEventListener('abort', shutdown);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
