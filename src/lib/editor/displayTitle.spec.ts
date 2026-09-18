import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseMarkdown, parseSource } from '$lib/md';
import { schema } from '$lib/md/schema';
import { DISPLAY_TITLE_PATH } from '$lib/title';
import { extractSuggestions } from './extract';
import { hydrateAnnotations } from './hydrate';
import { displayTitleEnd, displayTitleText, withDisplayTitle } from './displayTitle';

describe('withDisplayTitle', () => {
	it('prepends an h1 that is not in the source map', () => {
		const source = 'Hello world.\n';
		const parsed = withDisplayTitle(parseMarkdown(source), 'Shown title');
		expect(displayTitleText(parsed.doc)).toBe('Shown title');
		expect(parsed.doc.firstChild?.attrs.displayTitle).toBe(true);
		const hello = parsed.map.srcToDoc(source.indexOf('Hello'));
		expect(hello).not.toBeNull();
		expect(parsed.doc.textBetween(hello!.pos, hello!.pos + 5)).toBe('Hello');
		expect(parsed.map.docToSrc(1)).toBeNull();
		expect(parsed.source).toBe(source);
	});

	it('shifts source-surface text so comments still land in the file', () => {
		const source = 'body text\n';
		const parsed = withDisplayTitle(parseSource(source), 'File name');
		expect(displayTitleEnd(parsed.doc)).toBeGreaterThan(0);
		const at = parsed.map.srcToDoc(source.indexOf('text'));
		expect(at).not.toBeNull();
		expect(parsed.doc.textBetween(at!.pos, at!.pos + 4)).toBe('text');
	});
});

describe('display title annotations', () => {
	it('extracts a replacement against the title, not the file', () => {
		const source = 'Body paragraph.\n';
		const parsed = withDisplayTitle(parseMarkdown(source), 'Shown title');
		const del = schema.marks.deletion!.create({
			id: 't1',
			authorId: 'rev',
			highlightColor: '#7c9cff'
		});
		const ins = schema.marks.insertion!.create({
			id: 't1',
			authorId: 'rev',
			highlightColor: '#7c9cff'
		});
		const from = 1;
		const to = 1 + 'Shown title'.length;
		const state = EditorState.create({ schema, doc: parsed.doc }).apply(
			EditorState.create({ schema, doc: parsed.doc })
				.tr.addMark(from, to, del)
				.insert(to, schema.text('New title', [ins]))
		);
		const extracted = extractSuggestions(state, parsed, new Set());
		expect(extracted).toHaveLength(1);
		expect(extracted[0]!.headingPath).toBe(DISPLAY_TITLE_PATH);
		expect(extracted[0]!.exact).toBe('Shown title');
		expect(extracted[0]!.replacement).toBe('New title');
		expect(extracted[0]!.offsetHint).toBe(0);
	});

	it('hydrates a title comment onto the virtual heading', () => {
		const source = 'Body paragraph.\n';
		const parsed = withDisplayTitle(parseMarkdown(source), 'Shown title');
		const hydrated = hydrateAnnotations(EditorState.create({ schema, doc: parsed.doc }), parsed, [
			{
				id: 'c1',
				type: 'comment',
				status: 'open',
				authorId: 'rev',
				highlightColor: '#7c9cff',
				replacement: null,
				body: 'rename this',
				exact: 'Shown',
				prefix: '',
				suffix: ' title',
				offsetHint: 0,
				headingPath: DISPLAY_TITLE_PATH,
				paraOrdinal: 0
			}
		]);
		expect(hydrated.detached).toHaveLength(0);
		expect(hydrated.commentRanges).toHaveLength(1);
		expect(parsed.doc.textBetween(hydrated.commentRanges[0]!.from, hydrated.commentRanges[0]!.to)).toBe(
			'Shown'
		);
	});
});
