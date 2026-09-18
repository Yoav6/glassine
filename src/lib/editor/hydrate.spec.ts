import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { buildSelector } from '$lib/anchor';
import { parseMarkdown } from '$lib/md';
import { schema } from '$lib/md/schema';
import { acceptSuggestionMarks } from './accept';
import { hydrateAnnotations, previewAcceptedDocument, type HydratableAnnotation } from './hydrate';
import type { Node } from 'prosemirror-model';

function linkedText(doc: Node): string {
	let text = '';
	doc.descendants((node) => {
		if (node.isText && node.marks.some((mark) => mark.type.name === 'link')) text += node.text;
		return true;
	});
	return text;
}

function suggestion(
	source: string,
	exact: string,
	replacement: string,
	id: string
): HydratableAnnotation {
	const start = source.indexOf(exact);
	const selector = buildSelector(source, start, start + exact.length, { path: '', paraOrdinal: 1 });
	return {
		id,
		type: 'suggestion',
		status: 'open',
		authorId: 'alice',
		highlightColor: '#7c9cff',
		replacement,
		body: null,
		...selector
	};
}

describe('previewAcceptedDocument', () => {
	it('paints a caret insertion as insertion marks only', () => {
		const source = 'product do well\n';
		const parsed = parseMarkdown(source);
		const at = source.indexOf(' do');
		const selector = buildSelector(source, at, at, { path: '', paraOrdinal: 1 });
		expect(selector.exact).toBe('');
		const mapped = parsed.map.srcRangeToDoc(at, at);
		expect(mapped).not.toBeNull();
		expect(mapped!.from).toBe(mapped!.to);

		const hydrated = hydrateAnnotations(EditorState.create({ schema, doc: parsed.doc }), parsed, [
			{
				id: 'ins-s',
				type: 'suggestion',
				status: 'open',
				authorId: 'alice',
				highlightColor: '#7c9cff',
				replacement: 's',
				body: null,
				...selector
			}
		]);
		let deleted = '';
		let inserted = '';
		hydrated.state.doc.descendants((node) => {
			if (!node.isText) return true;
			if (node.marks.some((mark) => mark.type.name === 'deletion')) deleted += node.text;
			if (node.marks.some((mark) => mark.type.name === 'insertion')) inserted += node.text;
			return true;
		});
		expect(deleted).toBe('');
		expect(inserted).toBe('s');
		expect(hydrated.state.doc.textContent).toContain('products do well');
	});
	it('keeps a replacement inside a surrounding hyperlink after accept and in the modified preview', () => {
		const source = 'The Greeks [considered elections an oligarchic mechanism](https://example.com).\n';
		const parsed = parseMarkdown(source);
		const base = EditorState.create({ schema, doc: parsed.doc });
		const anns = [suggestion(source, 'oligarchic', 'aristocratic', 's1')];
		const hydrated = hydrateAnnotations(base, parsed, anns);
		let insertedLink = false;
		hydrated.state.doc.descendants((node) => {
			if (!node.isText || node.text !== 'aristocratic') return true;
			insertedLink = node.marks.some((mark) => mark.type.name === 'link');
			return false;
		});
		expect(insertedLink).toBe(true);

		const accepted = acceptSuggestionMarks(hydrated.state, ['s1']);
		expect(accepted).not.toBeNull();
		expect(linkedText(accepted!.doc)).toBe('considered elections an aristocratic mechanism');

		const preview = previewAcceptedDocument(base, parsed, anns);
		expect(preview.doc.textContent).toContain('aristocratic');
		expect(preview.doc.textContent).not.toContain('oligarchic');
		expect(linkedText(preview.doc)).toBe('considered elections an aristocratic mechanism');
	});

	it('reads as if visible suggestions were accepted, without suggestion marks', () => {
		const source = 'The cat sat on the mat.\n';
		const parsed = parseMarkdown(source);
		const preview = previewAcceptedDocument(
			EditorState.create({ schema, doc: parsed.doc }),
			parsed,
			[suggestion(source, 'cat', 'dog', 's1')]
		);
		expect(preview.doc.textContent).toContain('The dog sat on the mat.');
		expect(preview.doc.textContent).not.toContain('cat');
		let marked = false;
		preview.doc.descendants((node) => {
			if (node.marks.some((mark) => mark.type.name === 'insertion' || mark.type.name === 'deletion')) {
				marked = true;
			}
			return true;
		});
		expect(marked).toBe(false);
	});

	it('keeps a detached open suggestion out of the document', () => {
		const source = 'The cat sat on the mat.\n';
		const parsed = parseMarkdown(source);
		const hydrated = hydrateAnnotations(EditorState.create({ schema, doc: parsed.doc }), parsed, [
			{ ...suggestion(source, 'cat', 'dog', 's1'), detached: true }
		]);
		expect(hydrated.inline).toHaveLength(0);
		expect(hydrated.detached.map((item) => item.id)).toEqual(['s1']);
	});

	it('does not paint a resolved comment even when the quote still matches', () => {
		const source = 'The cat sat on the mat.\n';
		const parsed = parseMarkdown(source);
		const hydrated = hydrateAnnotations(EditorState.create({ schema, doc: parsed.doc }), parsed, [
			{ ...suggestion(source, 'mat', 'mat', 'c1'), type: 'comment', status: 'resolved', replacement: null, body: 'note' }
		]);
		expect(hydrated.inline).toHaveLength(0);
		expect(hydrated.commentRanges).toHaveLength(0);
		expect(hydrated.detached).toHaveLength(0);
	});

	it('ignores comments and overlapping suggestions the hydrate step cannot apply', () => {
		const source = 'The cat sat on the mat.\n';
		const parsed = parseMarkdown(source);
		const comment: HydratableAnnotation = {
			...suggestion(source, 'mat', 'mat', 'c1'),
			type: 'comment',
			replacement: null,
			body: 'note'
		};
		const preview = previewAcceptedDocument(
			EditorState.create({ schema, doc: parsed.doc }),
			parsed,
			[
				suggestion(source, 'cat sat', 'dog stood', 's1'),
				suggestion(source, 'cat sat', 'kitten sat', 's2'),
				comment
			]
		);
		expect(preview.doc.textContent).toContain('The dog stood on the mat.');
		expect(preview.overlapping.map((item) => item.id)).not.toContain('s2');
		expect(preview.doc.textContent).not.toContain('kitten');
	});

	it('keeps overlapping suggestions from different reviewers', () => {
		const source = 'The cat sat on the mat.\n';
		const parsed = parseMarkdown(source);
		const preview = previewAcceptedDocument(
			EditorState.create({ schema, doc: parsed.doc }),
			parsed,
			[
				suggestion(source, 'cat sat', 'dog stood', 's1'),
				{ ...suggestion(source, 'cat sat', 'kitten sat', 's2'), authorId: 'bob', updatedAt: 2 }
			]
		);
		expect(preview.doc.textContent).toContain('The dog stood on the mat.');
		expect(preview.overlapping.map((item) => item.id)).toEqual(['s2']);
	});

	it('applies a later edit from the same reviewer instead of treating it as a clash', () => {
		const source = 'This article is about glassine.\n';
		const parsed = parseMarkdown(source);
		const hydrated = hydrateAnnotations(EditorState.create({ schema, doc: parsed.doc }), parsed, [
			{ ...suggestion(source, 'article', 'es', 's1'), updatedAt: 1 },
			{ ...suggestion(source, 'article', 'essay', 's2'), updatedAt: 2 }
		]);
		expect(hydrated.overlapping).toHaveLength(0);
		let inserted = '';
		hydrated.state.doc.descendants((node) => {
			if (node.isText && node.marks.some((mark) => mark.type.name === 'insertion')) {
				inserted += node.text;
			}
			return true;
		});
		expect(inserted).toBe('essay');
	});
});
