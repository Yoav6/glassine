import type { EditorState, Transaction } from 'prosemirror-state';
import { suggestChangesKey } from '@handlewithcare/prosemirror-suggest-changes';

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
