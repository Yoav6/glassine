type Subscriber = {
	send: (event: string, data: unknown) => void;
};

/**
 * In-memory fan-out, keyed by channel. The app is one Node process in one
 * container, so a Map is the whole implementation; a second app instance would
 * need a real bus.
 *
 * Two channel kinds exist: `doc:<id>` for base-moved on an open document, and
 * `user:<id>` for that person's notification bell.
 */
const hubs = new Map<string, Set<Subscriber>>();

export function docChannel(documentId: string): string {
	return `doc:${documentId}`;
}

export function userChannel(userId: string): string {
	return `user:${userId}`;
}

export function subscribe(key: string, send: Subscriber['send']): () => void {
	let set = hubs.get(key);
	if (!set) {
		set = new Set();
		hubs.set(key, set);
	}
	const sub: Subscriber = { send };
	set.add(sub);
	return () => {
		set!.delete(sub);
		if (set!.size === 0) hubs.delete(key);
	};
}

export function broadcast(key: string, event: string, data: unknown) {
	const set = hubs.get(key);
	if (!set) return;
	for (const sub of set) {
		try {
			sub.send(event, data);
		} catch {
			set.delete(sub);
		}
	}
}
