export type AccessReviewer = {
	id: string;
	name: string;
};

function compareReviewers(a: AccessReviewer, b: AccessReviewer) {
	const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	return byName || a.id.localeCompare(b.id);
}

export function groupReviewersByAccess<T extends AccessReviewer>(
	reviewers: T[],
	grantedIds: Iterable<string>
): { granted: T[]; others: T[] } {
	const grantedSet = new Set(grantedIds);
	const granted: T[] = [];
	const others: T[] = [];
	for (const reviewer of [...reviewers].sort(compareReviewers)) {
		if (grantedSet.has(reviewer.id)) granted.push(reviewer);
		else others.push(reviewer);
	}
	return { granted, others };
}
