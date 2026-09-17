import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '$lib/md';
import { schema } from '$lib/md/schema';
import {
	applyCommentEmphasis,
	applyCommentRanges,
	commentDecorations,
	commentDecorationsKey,
	commentIdsAt,
	liveCommentRanges,
	sameCommentRanges
} from './comments';

function stateWithComment(from: number, to: number) {
	const parsed = parseMarkdown('hello world\n');
	return EditorState.create({
		schema,
		doc: parsed.doc,
		plugins: [
			commentDecorations([
				{ id: 'c1', from, to, color: '#7c9cff', authorId: 'alice' }
			])
		]
	});
}

describe('commentDecorations', () => {
	it('records live ranges that map when the document changes', () => {
		let state = stateWithComment(1, 6);
		expect(liveCommentRanges(state)).toEqual([
			{ id: 'c1', from: 1, to: 6, color: '#7c9cff', authorId: 'alice' }
		]);
		state = state.apply(state.tr.insertText('xxx', 1));
		expect(liveCommentRanges(state)[0]).toMatchObject({ id: 'c1', from: 4, to: 9 });
	});

	it('finds comments under a caret and marks emphasis on the decoration spec', () => {
		let state = stateWithComment(1, 6);
		expect(commentIdsAt(state, 3)).toEqual(['c1']);
		expect(commentIdsAt(state, 8)).toEqual([]);
		state = state.apply(applyCommentEmphasis(state.tr, ['c1']));
		expect(commentDecorationsKey.getState(state)?.decorations.find()[0]?.spec.emphasized).toBe(true);
	});

	it('replaces live ranges when a comment is attached', () => {
		let state = stateWithComment(1, 6);
		state = state.apply(
			applyCommentRanges(state.tr, [
				{ id: 'c1', from: 1, to: 6, color: '#7c9cff', authorId: 'alice' },
				{ id: 'c2', from: 7, to: 12, color: '#7c9cff', authorId: 'bob' }
			])
		);
		expect(liveCommentRanges(state).map((range) => range.id)).toEqual(['c1', 'c2']);
	});

	it('returns no ranges when the comment plugin is not present', () => {
		const state = EditorState.create({ schema, doc: parseMarkdown('hello\n').doc });
		expect(liveCommentRanges(state)).toEqual([]);
		expect(commentIdsAt(state, 1)).toEqual([]);
	});

	it('compares live ranges without treating a new array as a change', () => {
		expect(
			sameCommentRanges(
				[{ id: 'c1', from: 1, to: 4 }],
				[{ id: 'c1', from: 1, to: 4 }]
			)
		).toBe(true);
		expect(
			sameCommentRanges(
				[{ id: 'c1', from: 1, to: 4 }],
				[{ id: 'c1', from: 1, to: 5 }]
			)
		).toBe(false);
	});
});
