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

function safeSelectorId(id: string): string | null {
	// Ids are generated (uuid-like); anything else cannot be safely put in a selector.
	return /^[\w-]+$/.test(id) ? id : null;
}

/**
 * Stylesheet that truly hides the given people's annotations, your own included: their
 * insertions vanish, their deletions read as if never made (the struck-through text is
 * gone, and what is left looks like ordinary, undeleted prose), and their comments carry
 * no highlight. Applied without touching the editor's content, so toggling never rebuilds
 * it and never drops a suggestion made this visit.
 */
export function hiddenAnnotationsCss(hiddenIds: string[]): string {
	const rules: string[] = [];
	for (const raw of hiddenIds) {
		const id = safeSelectorId(raw);
		if (!id) continue;
		const by = `[data-author-id="${id}"]`;
		rules.push(`.glassine-doc ins${by}{display:none !important}`);
		rules.push(
			`.glassine-doc del${by}{background:none !important;text-decoration:none !important;color:inherit !important}`
		);
		rules.push(
			`.glassine-doc .comment-hl${by}{background:none !important;border-color:transparent !important;cursor:text !important}`
		);
	}
	return rules.join('\n');
}

/**
 * Stylesheet for "Suggesting (clean)": the viewer's own suggestions look and feel like plain
 * editing rather than tracked changes. An insertion reads as ordinary text (no highlight) and
 * a deletion reads as if the text were actually removed (it disappears, with no strikethrough).
 * Comments are untouched — they still show as comments in this mode.
 */
export function cleanSuggestingCss(viewerId: string): string {
	const id = safeSelectorId(viewerId);
	if (!id) return '';
	const by = `[data-author-id="${id}"]`;
	return [
		`.glassine-doc ins${by}{background:none !important}`,
		`.glassine-doc del${by}{display:none !important}`
	].join('\n');
}
