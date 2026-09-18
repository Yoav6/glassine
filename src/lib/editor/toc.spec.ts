import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseSource } from '$lib/md';
import { extractToc, pickActiveTocIndex, tocIndent, tocMinLevel } from './toc';

describe('extractToc', () => {
	it('lists article headings in document order with their levels', () => {
		const { doc } = parseMarkdown('# Title\n\nIntro\n\n## One\n\n### Nested\n\n## Two\n');
		expect(extractToc(doc)).toEqual([
			{ pos: expect.any(Number), level: 1, text: 'Title' },
			{ pos: expect.any(Number), level: 2, text: 'One' },
			{ pos: expect.any(Number), level: 3, text: 'Nested' },
			{ pos: expect.any(Number), level: 2, text: 'Two' }
		]);
		const texts = extractToc(doc).map((item) => doc.textBetween(item.pos + 1, item.pos + 1 + item.text.length));
		expect(texts).toEqual(['Title', 'One', 'Nested', 'Two']);
	});

	it('skips headings inside footnotes', () => {
		const { doc } = parseMarkdown('# Title\n\nSee.[^a]\n\n[^a]: ## Not in toc\n');
		expect(extractToc(doc).map((item) => item.text)).toEqual(['Title']);
	});

	it('reads ATX headings from the source surface and skips YAML and fences', () => {
		const source = [
			'---',
			'# not a heading',
			'title: hidden',
			'---',
			'',
			'# Real',
			'',
			'```',
			'# fenced',
			'```',
			'',
			'## Later',
			''
		].join('\n');
		const { doc } = parseSource(source);
		expect(extractToc(doc).map((item) => item.text)).toEqual(['Real', 'Later']);
		expect(extractToc(doc).map((item) => item.level)).toEqual([1, 2]);
	});

	it('omits empty heading lines', () => {
		const { doc } = parseMarkdown('##\n\n# Body\n');
		expect(extractToc(doc).map((item) => item.text)).toEqual(['Body']);
	});
});

describe('toc indent', () => {
	it('indents relative to the shallowest heading in the list', () => {
		const items = extractToc(parseMarkdown('## A\n\n### B\n\n## C\n').doc);
		const min = tocMinLevel(items);
		expect(min).toBe(2);
		expect(items.map((item) => tocIndent(item.level, min))).toEqual([0, 1, 0]);
	});
});

describe('pickActiveTocIndex', () => {
	it('returns the last heading that has crossed the reading line', () => {
		expect(pickActiveTocIndex([10, 80, 200], 90)).toBe(1);
		expect(pickActiveTocIndex([10, 80, 200], 8)).toBe(0);
	});

	it('returns null when there are no headings', () => {
		expect(pickActiveTocIndex([], 40)).toBeNull();
	});
});
