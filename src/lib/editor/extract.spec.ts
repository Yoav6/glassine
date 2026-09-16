import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '$lib/md';
import { schema } from '$lib/md/schema';
import { extractSuggestions } from './extract';

describe('extractSuggestions', () => {
	it('anchors a pure insertion by widening to the surrounding word', () => {
		const source = 'glassine is translucent paper.\n';
		const parsed = parseMarkdown(source);
		const needle = 'translucent';
		const mapped = parsed.map.srcToDoc(source.indexOf(needle));
		expect(mapped).not.toBeNull();
		const from = mapped!.pos;
		const ins = schema.marks.insertion!.create({
			id: 'ins-1',
			authorId: 'alice',
			highlightColor: '#7c9cff'
		});
		const state = EditorState.create({ schema, doc: parsed.doc }).apply(
			EditorState.create({ schema, doc: parsed.doc }).tr.insert(
				from,
				schema.text('very ', [ins])
			)
		);
		const extracted = extractSuggestions(state, parsed, new Set());
		expect(extracted).toHaveLength(1);
		expect(extracted[0]!.id).toBe('ins-1');
		expect(extracted[0]!.authorId).toBe('alice');
		expect(extracted[0]!.exact).toBe('translucent');
		expect(extracted[0]!.replacement).toBe('very translucent');
	});

	it('skips suggestion ids the client already persisted', () => {
		const source = 'alpha beta\n';
		const parsed = parseMarkdown(source);
		const mapped = parsed.map.srcToDoc(source.indexOf('beta'));
		expect(mapped).not.toBeNull();
		const del = schema.marks.deletion!.create({
			id: 'del-1',
			authorId: 'bob',
			highlightColor: '#f0a36f'
		});
		const state = EditorState.create({ schema, doc: parsed.doc }).apply(
			EditorState.create({ schema, doc: parsed.doc }).tr.addMark(
				mapped!.pos,
				mapped!.pos + 4,
				del
			)
		);
		expect(extractSuggestions(state, parsed, new Set(['del-1']))).toHaveLength(0);
		const next = extractSuggestions(state, parsed, new Set());
		expect(next).toHaveLength(1);
		expect(next[0]!.replacement).toBe('');
		expect(next[0]!.exact).toBe('beta');
	});
});
