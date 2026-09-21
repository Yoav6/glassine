import type { AccessPerson } from './access';

/** Explicit show/hide choices a reviewer made in the Annotations menu, by user id. */
export type ShownOverrides = Record<string, boolean>;

export type Viewer = { id: string; role: string };

/**
 * Until the viewer chooses otherwise, authors see everything and reviewers see only
 * their own and the author's annotations, even when their grant allows more.
 */
export function isShownByDefault(person: { id: string; role: string }, viewer: Viewer): boolean {
	return viewer.role === 'author' || person.id === viewer.id || person.role === 'author';
}

export function isAuthorShown(
	authorId: string,
	overrides: ShownOverrides,
	viewer: Viewer,
	sources: AccessPerson[]
): boolean {
	const explicit = overrides[authorId];
	if (explicit !== undefined) return explicit;
	const person = sources.find((source) => source.id === authorId);
	// Someone the viewer can see annotations from but who is not listed stays hidden from a reviewer.
	return person ? isShownByDefault(person, viewer) : viewer.role === 'author' || authorId === viewer.id;
}

function storageKey(slug: string, viewerId: string) {
	return `glassine-annotations:${slug}:${viewerId}`;
}

export function loadShownOverrides(slug: string, viewerId: string): ShownOverrides {
	try {
		const parsed = JSON.parse(localStorage.getItem(storageKey(slug, viewerId)) ?? '{}');
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
		);
	} catch {
		return {};
	}
}

export function saveShownOverrides(slug: string, viewerId: string, overrides: ShownOverrides) {
	try {
		localStorage.setItem(storageKey(slug, viewerId), JSON.stringify(overrides));
	} catch {
		/* the choice still applies for this visit */
	}
}

/**
 * Stylesheet that hides the given authors' annotations in the document without touching the
 * editor's content, so toggling never rebuilds the editor (and never drops unsaved marks).
 * Your own hidden suggestions read as plain edits: insertions look like ordinary text and
 * deletions are gone. Anyone else's hidden suggestions read as if never made.
 */
export function hiddenAuthorsCss(hiddenIds: string[], viewerId: string): string {
	const rules: string[] = [];
	for (const id of hiddenIds) {
		// Ids are generated (uuid-like); anything else cannot be safely put in a selector.
		if (!/^[\w-]+$/.test(id)) continue;
		const by = `[data-author-id="${id}"]`;
		if (id === viewerId) {
			rules.push(`.glassine-doc ins${by}{background:none !important}`);
			rules.push(`.glassine-doc del${by}{display:none !important}`);
		} else {
			rules.push(`.glassine-doc ins${by}{display:none !important}`);
			rules.push(
				`.glassine-doc del${by}{background:none !important;text-decoration:none !important;color:inherit !important}`
			);
		}
		rules.push(
			`.glassine-doc .comment-hl${by}{background:none !important;border-color:transparent !important;cursor:text !important}`
		);
	}
	return rules.join('\n');
}
