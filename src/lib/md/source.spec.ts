import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { buildSelector } from '$lib/anchor';
import { parseSource, serializeSourceDoc } from './source';
import { extractSuggestions } from '$lib/editor/extract';
import { hydrateAnnotations, type HydratableAnnotation } from '$lib/editor/hydrate';
import { schema } from './schema';

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

describe('parseSource', () => {
	it('maps source offsets onto the raw text one-to-one', () => {
		const source = '# Title\n\nHello **world**.\n';
		const parsed = parseSource(source);
		expect(parsed.doc.textContent).toBe(source);
		const hello = source.indexOf('Hello');
		expect(parsed.map.srcToDoc(hello)?.pos).toBe(1 + hello);
		expect(parsed.map.docToSrc(1 + hello)?.offset).toBe(hello);
	});

	it('preserves blank lines in the source buffer', () => {
		const source = 'a\n\n\n\nb\n';
		const parsed = parseSource(source);
		expect(serializeSourceDoc(parsed.doc)).toBe(source);
		expect(parsed.doc.textContent).toBe(source);
	});
});

describe('hydrate on source', () => {
	it('uses the same suggestion marks as the article editor', () => {
		const source = 'The cat sat.\n';
		const parsed = parseSource(source);
		const at = source.indexOf('cat');
		const mapped = parsed.map.srcRangeToDoc(at, at + 3);
		expect(parsed.doc.textBetween(mapped!.from, mapped!.to)).toBe('cat');
		const hydrated = hydrateAnnotations(
			EditorState.create({ schema, doc: parsed.doc }),
			parsed,
			[suggestion(source, 'cat', 'dog', 's1')]
		);
		let deleted = '';
		let inserted = '';
		hydrated.state.doc.descendants((node) => {
			if (!node.isText) return true;
			if (node.marks.some((mark) => mark.type.name === 'deletion')) deleted += node.text;
			if (node.marks.some((mark) => mark.type.name === 'insertion')) inserted += node.text;
			return true;
		});
		expect(deleted).toBe('cat');
		expect(inserted).toBe('dog');
		expect(serializeSourceDoc(hydrated.state.doc)).toBe(source);
	});

	it('extracts the same substitution selectors as the article editor', () => {
		const source = 'The cat sat.\n';
		const parsed = parseSource(source);
		const hydrated = hydrateAnnotations(
			EditorState.create({ schema, doc: parsed.doc }),
			parsed,
			[suggestion(source, 'cat', 'dog', 's1')]
		);
		const extracted = extractSuggestions(hydrated.state, parsed, new Set());
		expect(extracted).toHaveLength(1);
		expect(extracted[0]!.exact).toBe('cat');
		expect(extracted[0]!.replacement).toBe('dog');
	});
});
