import type { Mark } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

function isElement(target: EventTarget | null): target is Element {
	return typeof Element !== 'undefined' && target instanceof Element;
}

export function hrefFromLinkTarget(target: EventTarget | null): string | null {
	if (!isElement(target)) return null;
	const el = target.closest('a[href], [data-link-href]');
	if (!el) return null;
	return el.getAttribute('href') || el.getAttribute('data-link-href');
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

export function editorLinks(): Plugin {
	return new Plugin({
		props: {
			handleClick(view, _pos, event) {
				const href = hrefFromLinkTarget(event.target);
				if (!href) return false;
				if (event.metaKey || event.ctrlKey) {
					event.preventDefault();
					window.open(href, '_blank', 'noopener,noreferrer');
					return true;
				}
				if (view.editable && isElement(event.target) && event.target.closest('a[href]')) {
					event.preventDefault();
					return true;
				}
				return false;
			}
		}
	});
}
