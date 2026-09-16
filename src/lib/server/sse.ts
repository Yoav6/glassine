type Subscriber = {
	send: (event: string, data: unknown) => void;
};

const hubs = new Map<string, Set<Subscriber>>();

export function subscribe(documentId: string, send: Subscriber['send']): () => void {
	let set = hubs.get(documentId);
	if (!set) {
		set = new Set();
		hubs.set(documentId, set);
	}
	const sub: Subscriber = { send };
	set.add(sub);
	return () => {
		set!.delete(sub);
		if (set!.size === 0) hubs.delete(documentId);
	};
}

export function broadcast(documentId: string, event: string, data: unknown) {
	const set = hubs.get(documentId);
	if (!set) return;
	for (const sub of set) {
		try {
			sub.send(event, data);
		} catch {
			set.delete(sub);
		}
	}
}
