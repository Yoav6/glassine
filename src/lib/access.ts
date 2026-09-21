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

export type AccessPerson = AccessReviewer & { role: 'author' | 'reviewer' };

/**
 * Which annotations a reviewer may see and interact with on one document.
 * Stored in `grant.visibilityScope` as `default`, `all` or `custom:<id>,<id>`.
 * The reviewer's own annotations are always included.
 */
export type AnnotationScope =
	| { kind: 'default' }
	| { kind: 'all' }
	| { kind: 'custom'; ids: string[] };

export type ScopeKind = 'default' | 'custom';

const CUSTOM_PREFIX = 'custom:';

function splitIds(raw: string) {
	return [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))];
}

export function parseScope(raw: string | null | undefined): AnnotationScope {
	const value = (raw ?? '').trim();
	// `own` is what grants stored before the Default/Custom split.
	if (!value || value === 'default' || value === 'own') return { kind: 'default' };
	if (value === 'all') return { kind: 'all' };
	// A bare comma list is accepted too: it was the only other format the server ever understood.
	return { kind: 'custom', ids: splitIds(value.startsWith(CUSTOM_PREFIX) ? value.slice(CUSTOM_PREFIX.length) : value) };
}

export function serializeScope(scope: AnnotationScope): string {
	if (scope.kind === 'custom') return `${CUSTOM_PREFIX}${scope.ids.join(',')}`;
	return scope.kind;
}

/** What the Annotation select shows: `all` is just a custom choice of everyone. */
export function scopeKind(raw: string | null | undefined): ScopeKind {
	return parseScope(raw).kind === 'default' ? 'default' : 'custom';
}

/** Ids of the authors of annotations the viewer may see, the viewer's own included. */
export function visibleAuthorIds(
	scope: AnnotationScope,
	viewerId: string,
	users: { id: string; role: string }[]
): Set<string> {
	const ids = new Set([viewerId]);
	for (const person of users) {
		if (scope.kind === 'all' || (scope.kind === 'default' && person.role === 'author')) {
			ids.add(person.id);
		}
	}
	if (scope.kind === 'custom') {
		const known = new Set(users.map((person) => person.id));
		for (const id of scope.ids) if (known.has(id)) ids.add(id);
	}
	return ids;
}

/** The people ticked in the Custom picker, given the stored scope and everyone it lists. */
export function customSelection(raw: string | null | undefined, people: AccessPerson[]): string[] {
	const ids = visibleAuthorIds(
		parseScope(raw),
		'',
		people
	);
	return people.filter((person) => ids.has(person.id)).map((person) => person.id);
}

/** Authors first, then everyone else, each group A–Z. */
export function sortPeople<T extends AccessPerson>(people: T[]): T[] {
	return [...people].sort(
		(a, b) => Number(b.role === 'author') - Number(a.role === 'author') || compareReviewers(a, b)
	);
}
