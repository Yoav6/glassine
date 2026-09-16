const locks = new Map<string, Promise<void>>();

export async function withDocumentLock<T>(documentId: string, fn: () => Promise<T> | T): Promise<T> {
	const previous = locks.get(documentId) ?? Promise.resolve();
	let release!: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	locks.set(
		documentId,
		previous.then(() => current)
	);
	await previous;
	try {
		return await fn();
	} finally {
		release();
		if (locks.get(documentId) === current) locks.delete(documentId);
	}
}
