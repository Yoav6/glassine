import type { Node } from 'prosemirror-model';
import { isAuthorOnlyViewMode, type ViewMode } from '$lib/view-mode';

const SUGGESTION_MARK_TYPES = new Set([
	'insertion',
	'deletion',
	'modification',
	'blockBoundarySuggestion'
]);

export const SUGGESTION_MENU_OPEN_MS = 125;
export const SUGGESTION_MENU_CLOSE_MS = 200;

const SUGGESTION_MARK_SELECTOR = 'ins[data-id], del[data-id], [data-type="block-boundary-suggestion"][data-id]';

export type SuggestionHit = {
	id: string;
	authorId: string | null;
};

export function parseSuggestionDomId(raw: string | null | undefined): string | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed == null) return null;
		const id = String(parsed);
		return id || null;
	} catch {
		return raw || null;
	}
}

export function suggestionFromTarget(target: EventTarget | null): SuggestionHit | null {
	if (!(target instanceof Element)) return null;
	const el = target.closest(SUGGESTION_MARK_SELECTOR);
	if (!el) return null;
	const id = parseSuggestionDomId(el.getAttribute('data-id'));
	if (!id) return null;
	return { id, authorId: el.getAttribute('data-author-id') };
}

export function suggestionBounds(root: Element, id: string): { left: number; top: number; right: number; bottom: number } | null {
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	const marks = root.querySelectorAll(SUGGESTION_MARK_SELECTOR);
	for (const mark of marks) {
		if (parseSuggestionDomId(mark.getAttribute('data-id')) !== id) continue;
		const rect = mark.getBoundingClientRect();
		left = Math.min(left, rect.left);
		top = Math.min(top, rect.top);
		right = Math.max(right, rect.right);
		bottom = Math.max(bottom, rect.bottom);
	}
	if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
	return { left, top, right, bottom };
}

export function suggestionMenuPosition(
	box: { left: number; top: number; right: number; bottom: number },
	menu: { width: number; height: number },
	gap = 6
): { left: number; top: number; above: boolean } {
	const viewportW = typeof window === 'undefined' ? 800 : window.innerWidth;
	const left = Math.min(Math.max(8, box.left), Math.max(8, viewportW - menu.width - 8));
	const aboveTop = box.top - menu.height - gap;
	if (aboveTop >= 8) return { left, top: aboveTop, above: true };
	return { left, top: box.bottom + gap, above: false };
}

export function shouldKeepSuggestionMenu(opts: {
	menuId: string | null;
	hoveredId: string | null;
	caretId: string | null;
	hoveringMenu: boolean;
}): boolean {
	if (!opts.menuId) return false;
	if (opts.hoveringMenu) return true;
	if (opts.hoveredId === opts.menuId) return true;
	if (opts.caretId === opts.menuId) return true;
	return false;
}

export function suggestionIdsInDoc(doc: Node): Set<string> {
	const ids = new Set<string>();
	doc.descendants((node) => {
		for (const mark of node.marks) {
			if (!SUGGESTION_MARK_TYPES.has(mark.type.name)) continue;
			const id = String(mark.attrs.id ?? '');
			if (id) ids.add(id);
		}
		return true;
	});
	return ids;
}

export function canActOnSuggestion(opts: {
	role: 'author' | 'reviewer';
	userId: string;
	authorId: string | null;
	viewMode: ViewMode;
}): { accept: boolean; reject: boolean; comment: boolean } {
	const own = Boolean(opts.authorId && opts.authorId === opts.userId);
	const accept = opts.role === 'author' && isAuthorOnlyViewMode(opts.viewMode);
	if (opts.role === 'author') return { accept, reject: true, comment: true };
	return { accept: false, reject: own, comment: true };
}
