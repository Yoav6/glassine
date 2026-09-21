import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '$lib/md';
import { draftHighlight, draftHighlightKey } from './draftHighlight';

function stateFor(markdown: string) {
	const { doc } = parseMarkdown(markdown);
	return EditorState.create({ doc, plugins: [draftHighlight()] });
}

describe('draftHighlight', () => {
	it('holds the range it was given and clears on null', () => {
		let state = stateFor('Hello brave new world\n');
		expect(draftHighlightKey.getState(state)).toBeNull();
		state = state.apply(state.tr.setMeta(draftHighlightKey, { from: 7, to: 12 }));
		expect(draftHighlightKey.getState(state)).toEqual({ from: 7, to: 12 });
		state = state.apply(state.tr.setMeta(draftHighlightKey, null));
		expect(draftHighlightKey.getState(state)).toBeNull();
	});

	it('follows the passage when text is inserted before it', () => {
		let state = stateFor('Hello brave new world\n');
		state = state.apply(state.tr.setMeta(draftHighlightKey, { from: 7, to: 12 }));
		state = state.apply(state.tr.insertText('Oh! ', 1));
		expect(draftHighlightKey.getState(state)).toEqual({ from: 11, to: 16 });
	});

	it('drops the range once its text is deleted', () => {
		let state = stateFor('Hello brave new world\n');
		state = state.apply(state.tr.setMeta(draftHighlightKey, { from: 7, to: 12 }));
		state = state.apply(state.tr.delete(6, 13));
		expect(draftHighlightKey.getState(state)).toBeNull();
	});
});
