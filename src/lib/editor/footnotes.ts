import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

export function footnoteDomId(identifier: string): string {
	return `fn-${identifier}`;
}

export function footnoteRefDomId(identifier: string, index: number): string {
	return index === 0 ? `fnref-${identifier}` : `fnref-${identifier}-${index + 1}`;
}

export type FootnoteRefHit = { identifier: string; pos: number; index: number };

export function collectFootnoteRefs(doc: Node): FootnoteRefHit[] {
	const counts = new Map<string, number>();
	const refs: FootnoteRefHit[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== 'footnote_ref') return;
		const identifier = String(node.attrs.identifier ?? '1');
		const index = counts.get(identifier) ?? 0;
		counts.set(identifier, index + 1);
		refs.push({ identifier, pos, index });
	});
	return refs;
}

export function findFootnotePos(doc: Node, identifier: string): number | null {
	let found: number | null = null;
	doc.descendants((node, pos) => {
		if (found != null) return false;
		if (node.type.name === 'footnote' && String(node.attrs.identifier) === identifier) {
			found = pos;
			return false;
		}
	});
	return found;
}

export function findFootnoteRefPos(doc: Node, identifier: string, index: number): number | null {
	return collectFootnoteRefs(doc).find((ref) => ref.identifier === identifier && ref.index === index)
		?.pos ?? null;
}

function lastInlineEnd(node: Node, pos: number): number {
	if (node.isTextblock) return pos + node.nodeSize - 1;
	if (!node.lastChild) return pos + node.nodeSize - 1;
	const child = node.lastChild;
	const childPos = pos + node.nodeSize - 1 - child.nodeSize;
	return lastInlineEnd(child, childPos);
}

export function footnoteDecorations(doc: Node): Decoration[] {
	const refs = collectFootnoteRefs(doc);
	const byId = new Map<string, FootnoteRefHit[]>();
	for (const ref of refs) {
		const list = byId.get(ref.identifier) ?? [];
		list.push(ref);
		byId.set(ref.identifier, list);
	}

	const decos: Decoration[] = [];
	for (const ref of refs) {
		decos.push(
			Decoration.node(ref.pos, ref.pos + 1, { id: footnoteRefDomId(ref.identifier, ref.index) })
		);
	}

	doc.descendants((node, pos) => {
		if (node.type.name !== 'footnote') return;
		const identifier = String(node.attrs.identifier ?? '1');
		const matches = byId.get(identifier) ?? [];
		const widgetPos = lastInlineEnd(node, pos);
		for (const ref of matches) {
			decos.push(
				Decoration.widget(widgetPos, (view) => backrefEl(view, identifier, ref.index), {
					side: ref.index + 1,
					key: `fn-backref-${identifier}-${ref.index}`,
					ignoreSelection: true,
					stopEvent: () => true
				})
			);
		}
	});

	return decos;
}

function backrefEl(view: EditorView, identifier: string, index: number): HTMLElement {
	const a = document.createElement('a');
	a.className = 'fn-backref';
	a.href = `#${footnoteRefDomId(identifier, index)}`;
	a.textContent = '↩';
	a.contentEditable = 'false';
	a.setAttribute('aria-label', `Back to reference ${index + 1}`);
	a.addEventListener('mousedown', (event) => {
		event.preventDefault();
		event.stopPropagation();
	});
	a.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		const pos = findFootnoteRefPos(view.state.doc, identifier, index);
		if (pos != null) scrollPosIntoView(view, pos);
	});
	return a;
}

export function scrollPosIntoView(view: EditorView, pos: number): void {
	try {
		const node = view.nodeDOM(pos);
		const el = node instanceof HTMLElement ? node : node?.parentElement;
		if (el) {
			el.scrollIntoView({ block: 'center', behavior: 'smooth' });
			return;
		}
	} catch {
		// pos may be unmapped while the view is updating
	}
}

function identifierFromFnRef(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) return null;
	const el = target.closest('sup.fn-ref');
	if (!(el instanceof HTMLElement)) return null;
	return el.dataset.identifier ?? null;
}

export function footnotes(): Plugin {
	return new Plugin({
		props: {
			decorations(state) {
				return DecorationSet.create(state.doc, footnoteDecorations(state.doc));
			},
			handleDOMEvents: {
				mousedown(_view, event) {
					if (
						identifierFromFnRef(event.target) ||
						(event.target instanceof Element && event.target.closest('a.fn-backref'))
					) {
						event.preventDefault();
						return true;
					}
					return false;
				},
				click(view, event) {
					const identifier = identifierFromFnRef(event.target);
					if (!identifier) return false;
					event.preventDefault();
					const dest = findFootnotePos(view.state.doc, identifier);
					if (dest != null) scrollPosIntoView(view, dest);
					return true;
				}
			}
		}
	});
}
