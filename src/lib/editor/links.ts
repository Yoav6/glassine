import type { Mark, Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export function linkHrefAtPos(doc: PMNode, pos: number): string | null {
	const marks = doc.resolve(pos).marks();
	const mark = marks.find((item) => item.type.name === 'link');
	const href = mark?.attrs.href;
	return typeof href === 'string' && href ? href : null;
}

export function linkBoundsAtPos(
	view: EditorView,
	pos: number
): { left: number; top: number; right: number; bottom: number } | null {
	try {
		// Anchor on the caret itself (not the link element's DOM rect): a link that
		// wraps across lines has one element spanning both, whose bounding rect
		// would cover the whole union and misplace the popover.
		const coords = view.coordsAtPos(pos);
		return { left: coords.left, top: coords.top, right: coords.left, bottom: coords.bottom };
	} catch {
		return null;
	}
}

export function linkMarkView(mark: Mark, view: EditorView) {
	const href = String(mark.attrs.href ?? '');
	const title = typeof mark.attrs.title === 'string' ? mark.attrs.title : null;
	if (view.editable) {
		const span = document.createElement('span');
		span.className = 'pm-link';
		span.dataset.linkHref = href;
		if (title) span.title = title;
		return { dom: span, contentDOM: span };
	}
	const a = document.createElement('a');
	a.href = href;
	if (title) a.title = title;
	a.target = '_blank';
	a.rel = 'noopener noreferrer';
	return { dom: a, contentDOM: a };
}
