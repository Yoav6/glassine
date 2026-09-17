import { describe, expect, it } from 'vitest';
import { closeHistory, history, undo } from 'prosemirror-history';
import { EditorState } from 'prosemirror-state';
import { schema } from '$lib/md/schema';
import { parseMarkdown } from '$lib/md';
import { extractSuggestions } from './extract';
import { acceptSuggestionMarks } from './accept';
import {
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
					() => 'ins-1',
					() => ({ authorId: 'author', highlightColor: '#7c9cff' })
				)
			: tr;
	return state.apply(transaction);
}

describe('acceptSuggestionMarks', () => {
	it('turns an author insertion into ordinary text', () => {
		const parsed = parseMarkdown('glassine is translucent paper.\n');
		let state = EditorState.create({
			schema,
			doc: parsed.doc,
			plugins: [history(), suggestChanges()]
		});
		enableSuggestChanges(state, (tr) => {
			state = state.apply(tr);
		});
		state = dispatch(state, state.tr.insertText('VERY ', 1));
		const extracted = extractSuggestions(state, parsed, new Set());
		expect(extracted).toHaveLength(1);
		expect(state.doc.rangeHasMark(1, 6, schema.marks.insertion!)).toBe(true);

		const tr = acceptSuggestionMarks(state, extracted.map((item) => item.id));
		expect(tr).not.toBeNull();
		state = state.apply(tr!);
		expect(state.doc.textContent).toContain('VERY');
		expect(state.doc.rangeHasMark(1, 6, schema.marks.insertion!)).toBe(false);
	});

	it('undo restores a history-event accept so the marks can be acted on again', () => {
		const parsed = parseMarkdown('glassine is translucent paper.\n');
		const ins = schema.marks.insertion!.create({
			id: 'rev-1',
			authorId: 'bob',
			highlightColor: '#f0a36f'
		});
		const from = parsed.map.srcToDoc(parsed.source.indexOf('glassine'))!.pos;
		let state = EditorState.create({
			schema,
			doc: parsed.doc,
			plugins: [history(), suggestChanges()]
		});
		state = state.apply(
			state.tr.insert(from, schema.text('VERY ', [ins])).setMeta('addToHistory', false)
		);
		expect(state.doc.rangeHasMark(from, from + 5, schema.marks.insertion!)).toBe(true);

		const tr = acceptSuggestionMarks(state, ['rev-1']);
		expect(tr).not.toBeNull();
		state = state.apply(closeHistory(tr!));
		expect(state.doc.textContent).toContain('VERY');
		expect(state.doc.rangeHasMark(from, from + 5, schema.marks.insertion!)).toBe(false);

		const undone = undo(state, (next) => {
			state = state.apply(next);
		});
		expect(undone).toBe(true);
		expect(state.doc.textContent).toContain('VERY');
		expect(state.doc.rangeHasMark(from, from + 5, schema.marks.insertion!)).toBe(true);
	});
});
