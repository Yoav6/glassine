import { describe, expect, it } from 'vitest';
import { history, undo, undoDepth } from 'prosemirror-history';
import { EditorState } from 'prosemirror-state';
import { applySubstitutions } from '$lib/anchor';
import { schema } from '$lib/md/schema';
import { parseMarkdown } from '$lib/md';
import { extractSuggestions, substitutionsFromTransaction } from './extract';
import {
	applySuggestion,
	enableSuggestChanges,
	isSuggestChangesEnabled,
	suggestChanges,
	suggestChangesKey,
	transformToSuggestionTransaction
} from '@handlewithcare/prosemirror-suggest-changes';

function dispatch(
	state: EditorState,
	tr: Parameters<typeof transformToSuggestionTransaction>[0]
) {
	const skip = tr.getMeta(suggestChangesKey) as { skip?: true } | undefined;
	const transaction =
		isSuggestChangesEnabled(state) &&
		!tr.getMeta('history$') &&
		!("skip" in (skip ?? {}))
			? transformToSuggestionTransaction(
					tr,
					state,
					() => 'new-id',
					() => ({ authorId: 'author', highlightColor: '#7c9cff' })
				)
			: tr;
	return state.apply(transaction);
}

function editorState() {
	const parsed = parseMarkdown('glassine is translucent paper.\n');
	let state = EditorState.create({
		schema,
		doc: parsed.doc,
		plugins: [history(), suggestChanges()]
	});
	enableSuggestChanges(state, (tr) => {
		state = state.apply(tr);
	});
	return { state, parsed };
}

describe('undo with suggest-changes', () => {
	it('records history$ on undo transactions', () => {
		let { state } = editorState();
		state = dispatch(state, state.tr.insertText('hello', 1));
		expect(undoDepth(state)).toBeGreaterThan(0);
		let seenMeta: unknown;
		undo(state, (tr) => {
			seenMeta = tr.getMeta('history$');
			state = dispatch(state, tr);
		});
		expect(seenMeta).toBeTruthy();
	});

	it('undoes an insertion instead of accepting it', () => {
		let { state } = editorState();
		const before = state.doc.textContent;
		const insertAt = 1;
		state = dispatch(state, state.tr.insertText('VERY ', insertAt));
		expect(state.doc.textContent).toContain('VERY');
		expect(state.doc.rangeHasMark(insertAt, insertAt + 5, schema.marks.insertion!)).toBe(true);

		const undone = undo(state, (tr) => {
			state = dispatch(state, tr);
		});
		expect(undone).toBe(true);
		expect(state.doc.textContent).toBe(before);
		expect(state.doc.rangeHasMark(1, 6, schema.marks.insertion!)).toBe(false);
	});

	it('still undoes after the insertion is auto-accepted (marks removed, appended to history)', () => {
		let { state, parsed } = editorState();
		const before = state.doc.textContent;
		const insertAt = 1;
		state = dispatch(state, state.tr.insertText('VERY ', insertAt));
		const forward = extractSuggestions(state, parsed, new Set());
		expect(forward).toHaveLength(1);

		applySuggestion('new-id')(state, (tr) => {
			state = state.apply(tr.setMeta('appendedTransaction', state.tr));
		});
		expect(state.doc.textContent).toContain('VERY');
		expect(state.doc.rangeHasMark(insertAt, insertAt + 5, schema.marks.insertion!)).toBe(false);

		let undoTr: (typeof state.tr) | undefined;
		const undone = undo(state, (tr) => {
			undoTr = tr;
			state = dispatch(state, tr);
		});
		expect(undone).toBe(true);
		expect(state.doc.textContent).toBe(before);

		const nextSource = applySubstitutions(parsed.source, forward).source;
		const accepted = parseMarkdown(nextSource);
		const subs = substitutionsFromTransaction(undoTr!, accepted);
		expect(subs.length).toBeGreaterThan(0);
		expect(applySubstitutions(nextSource, subs).source).toBe(parsed.source);
	});

	it('still undoes an accepted deletion and round-trips the source', () => {
		let { state, parsed } = editorState();
		const before = state.doc.textContent;
		const from = parsed.map.srcToDoc(parsed.source.indexOf('translucent'))!.pos;
		state = dispatch(state, state.tr.delete(from, from + 'translucent'.length));
		const forward = extractSuggestions(state, parsed, new Set());
		expect(forward).toHaveLength(1);

		applySuggestion('new-id')(state, (tr) => {
			state = state.apply(tr.setMeta('appendedTransaction', state.tr));
		});
		expect(state.doc.textContent).not.toContain('translucent');

		let undoTr: (typeof state.tr) | undefined;
		expect(
			undo(state, (tr) => {
				undoTr = tr;
				state = dispatch(state, tr);
			})
		).toBe(true);
		expect(state.doc.textContent).toBe(before);

		const nextSource = applySubstitutions(parsed.source, forward).source;
		const subs = substitutionsFromTransaction(undoTr!, parseMarkdown(nextSource));
		expect(subs.length).toBeGreaterThan(0);
		expect(applySubstitutions(nextSource, subs).source).toContain('translucent');
	});

	it('does not persist undo of an insertion that was never accepted', () => {
		const { state: start, parsed } = editorState();
		let state = dispatch(start, start.tr.insertText('VERY ', 1));
		let undoTr: (typeof state.tr) | undefined;
		undo(state, (tr) => {
			undoTr = tr;
			state = dispatch(state, tr);
		});
		expect(substitutionsFromTransaction(undoTr!, parsed)).toEqual([]);
	});
});
