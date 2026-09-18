import type { EditorState, Transaction } from 'prosemirror-state';
import { suggestChangesKey } from '@handlewithcare/prosemirror-suggest-changes';
import { SUGGESTION_MARK_TYPES } from './suggestions';

/**
 * Strip suggestion marks for the given ids so author auto-accept looks like
 * normal text. Insertions keep their content; deletions drop theirs.
 */
export function acceptSuggestionMarks(state: EditorState, ids: Iterable<string>): Transaction | null {
	const idSet = new Set([...ids].map(String).filter(Boolean));
	if (!idSet.size) return null;

	const insertion = state.schema.marks.insertion;
	const deletion = state.schema.marks.deletion;
	const modification = state.schema.marks.modification;
	const boundary = state.schema.marks.blockBoundarySuggestion;
	const tr = state.tr;
	const deletions: { from: number; to: number }[] = [];

	state.doc.descendants((node, pos) => {
		for (const mark of node.marks) {
			if (!idSet.has(String(mark.attrs.id ?? ''))) continue;
			if (deletion && mark.type === deletion) {
				deletions.push({ from: pos, to: pos + node.nodeSize });
			} else if (node.isText) {
				tr.removeMark(pos, pos + node.nodeSize, mark);
			} else if (insertion && mark.type === insertion) {
				tr.removeNodeMark(pos, mark);
			} else if (modification && mark.type === modification) {
				tr.removeNodeMark(pos, mark);
			} else if (boundary && mark.type === boundary) {
				tr.removeNodeMark(pos, mark);
			}
		}
		return true;
	});

	for (const range of deletions.sort((a, b) => b.from - a.from)) {
		const from = tr.mapping.map(range.from);
		const to = tr.mapping.map(range.to);
		if (from < to) tr.delete(from, to);
	}

	if (!tr.steps.length) return null;
	return tr.setMeta(suggestChangesKey, { skip: true });
}

/** Rewrite suggestion mark ids, e.g. after folding a new edit onto an existing annotation. */
export function relabelSuggestionMarks(
	state: EditorState,
	pairs: Iterable<{ from: string; to: string }>
): Transaction | null {
	const map = new Map<string, string>();
	for (const pair of pairs) {
		if (pair.from && pair.to && pair.from !== pair.to) map.set(pair.from, pair.to);
	}
	if (!map.size) return null;

	const tr = state.tr;
	state.doc.descendants((node, pos) => {
		for (const mark of node.marks) {
			if (!SUGGESTION_MARK_TYPES.has(mark.type.name)) continue;
			const nextId = map.get(String(mark.attrs.id ?? ''));
			if (!nextId) continue;
			const next = mark.type.create({ ...mark.attrs, id: nextId });
			if (node.isText) {
				tr.removeMark(pos, pos + node.nodeSize, mark);
				tr.addMark(pos, pos + node.nodeSize, next);
			} else {
				tr.removeNodeMark(pos, mark);
				tr.addNodeMark(pos, next);
			}
		}
		return true;
	});

	if (!tr.steps.length) return null;
	return tr.setMeta(suggestChangesKey, { skip: true }).setMeta('addToHistory', false);
}
