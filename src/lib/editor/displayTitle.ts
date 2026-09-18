import { keymap } from 'prosemirror-keymap';
import { Plugin, TextSelection, type Command } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import type { Node } from 'prosemirror-model';
import { schema } from '$lib/md/schema';
import { PositionMap, type ParseResult } from '$lib/md';
import { DISPLAY_TITLE_PATH } from '$lib/title';

export { DISPLAY_TITLE_PATH };

export function displayTitleNode(doc: Node): Node | null {
	const first = doc.firstChild;
	if (first?.type.name === 'heading' && first.attrs.displayTitle) return first;
	return null;
}

/** Position immediately after the virtual title heading, or 0 if none. */
export function displayTitleEnd(doc: Node): number {
	const node = displayTitleNode(doc);
	return node ? node.nodeSize : 0;
}

export function displayTitleText(doc: Node): string | null {
	const node = displayTitleNode(doc);
	if (!node) return null;
	return node.textContent.replace(/\s+/g, ' ').trim();
}

/** Title text as stored (insertions omitted, deletions kept). */
export function baseDisplayTitle(doc: Node): string {
	const node = displayTitleNode(doc);
	if (!node) return '';
	let out = '';
	node.descendants((child) => {
		if (!child.isText) return true;
		if (child.marks.some((mark) => mark.type.name === 'insertion')) return false;
		out += child.text ?? '';
		return false;
	});
	return out;
}

export function posInDisplayTitle(doc: Node, pos: number): boolean {
	const end = displayTitleEnd(doc);
	return end > 0 && pos < end;
}

export function headingFromTitle(title: string): Node {
	const text = title.replace(/\s+/g, ' ').trim();
	return schema.node('heading', { level: 1, displayTitle: true }, text ? [schema.text(text)] : []);
}

export function withDisplayTitle(parsed: ParseResult, title: string): ParseResult {
	const heading = headingFromTitle(title);
	const shift = heading.nodeSize;
	const doc = parsed.doc.copy(parsed.doc.content.addToStart(heading));
	const map = new PositionMap(
		parsed.map.segments.map((seg) => ({ ...seg, docPos: seg.docPos + shift }))
	);
	return { ...parsed, doc, map };
}

/** Doc position of the first character in the virtual title heading. */
export function displayTitleContentStart(doc: Node): number {
	return displayTitleNode(doc) ? 1 : 0;
}

export function titleRangeToDoc(start: number, end: number): { from: number; to: number } {
	return { from: 1 + start, to: 1 + end };
}

/**
 * Map a doc position in the virtual heading to an offset in {@link baseDisplayTitle}
 * (insertions omitted, deletions kept).
 */
export function docPosToTitleOffset(doc: Node, pos: number): number {
	const heading = displayTitleNode(doc);
	if (!heading) return Math.max(0, pos - 1);
	const contentStart = displayTitleContentStart(doc);
	const limit = Math.max(contentStart, Math.min(pos, contentStart + heading.content.size));
	let offset = 0;
	heading.forEach((child, innerOffset) => {
		const childPos = contentStart + innerOffset;
		if (childPos >= limit) return;
		if (!child.isText) return;
		if (child.marks.some((mark) => mark.type.name === 'insertion')) return;
		const to = Math.min(childPos + child.nodeSize, limit);
		offset += Math.max(0, to - childPos);
	});
	return offset;
}

const exitDisplayTitle: Command = (state, dispatch) => {
	const end = displayTitleEnd(state.doc);
	if (!end) return false;
	const { from, to } = state.selection;
	if (from >= end && to >= end) return false;
	if (dispatch) {
		dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(end), 1)));
	}
	return true;
};

export function displayTitlePlugin(): Plugin {
	return new Plugin({
		filterTransaction(tr, state) {
			if (!tr.docChanged) return true;
			const before = displayTitleNode(state.doc);
			if (!before) return true;
			const after = displayTitleNode(tr.doc);
			if (!after || after.attrs.level !== 1) return false;
			if (tr.doc.childCount < state.doc.childCount) return false;
			if (tr.doc.childCount > state.doc.childCount) {
				const oldNext = state.doc.childCount > 1 ? state.doc.child(1) : null;
				const newNext = tr.doc.childCount > 1 ? tr.doc.child(1) : null;
				if (newNext?.type.name === 'heading' && oldNext?.type.name !== 'heading') return false;
			}
			for (const step of tr.steps) {
				if (!(step instanceof ReplaceStep)) continue;
				if (step.from === 0 && step.to >= before.nodeSize && step.slice.size === 0) return false;
			}
			return true;
		}
	});
}

export function displayTitleKeymap() {
	return keymap({
		Enter: exitDisplayTitle,
		'Shift-Enter': exitDisplayTitle,
		'Mod-Enter': exitDisplayTitle
	});
}
