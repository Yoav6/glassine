import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { buildSelector } from '$lib/anchor';
import { parseMarkdown } from '$lib/md';
import { schema } from '$lib/md/schema';
import { hydrateAnnotations, previewAcceptedDocument, type HydratableAnnotation } from './hydrate';

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
		expect(preview.overlapping.map((item) => item.id)).toContain('s2');
		expect(preview.doc.textContent).not.toContain('kitten');
	});
});
