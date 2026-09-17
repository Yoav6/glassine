import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { applySubstitution } from '$lib/anchor';
import { parseMarkdown } from '$lib/md';
import { schema } from '$lib/md/schema';
import { extractSuggestions } from './extract';
import { hydrateAnnotations } from './hydrate';

describe('extractSuggestions', () => {
	it('anchors a pure insertion at the caret with empty exact', () => {
		const source = 'glassine is translucent paper.\n';
		const parsed = parseMarkdown(source);
		const needle = 'translucent';
		const at = source.indexOf(needle);
		const mapped = parsed.map.srcToDoc(at);
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
		expect(extracted[0]!.exact).toBe('');
		expect(extracted[0]!.replacement).toBe('very ');
		expect(extracted[0]!.offsetHint).toBe(at);
		expect(applySubstitution(source, extracted[0]!).source).toContain('very translucent');
	});

	it('keeps a mid-word insertion as only the new character', () => {
		const source = 'glassine is translucent paper.\n';
		const parsed = parseMarkdown(source);
		const word = 'translucent';
		const mid = source.indexOf(word) + 'trans'.length;
		const mapped = parsed.map.srcToDoc(mid);
		expect(mapped).not.toBeNull();
		const ins = schema.marks.insertion!.create({
			id: 'ins-mid',
			authorId: 'alice',
			highlightColor: '#7c9cff'
		});
		const state = EditorState.create({ schema, doc: parsed.doc }).apply(
			EditorState.create({ schema, doc: parsed.doc }).tr.insert(mapped!.pos, schema.text('x', [ins]))
		);
		const extracted = extractSuggestions(state, parsed, new Set());
		expect(extracted).toHaveLength(1);
		expect(extracted[0]!.exact).toBe('');
		expect(extracted[0]!.replacement).toBe('x');
		expect(extracted[0]!.offsetHint).toBe(mid);
		expect(applySubstitution(source, extracted[0]!).source).toContain('transxlucent');

		const hydrated = hydrateAnnotations(EditorState.create({ schema, doc: parsed.doc }), parsed, [
			{
				id: 'ins-mid',
				type: 'suggestion',
				status: 'open',
				authorId: 'alice',
				highlightColor: '#7c9cff',
				replacement: extracted[0]!.replacement,
				body: null,
				exact: extracted[0]!.exact,
				prefix: extracted[0]!.prefix,
				suffix: extracted[0]!.suffix,
				offsetHint: extracted[0]!.offsetHint,
				headingPath: extracted[0]!.headingPath,
				paraOrdinal: extracted[0]!.paraOrdinal
			}
		]);
		expect(hydrated.inline.map((item) => item.id)).toEqual(['ins-mid']);
		let deleted = '';
		let inserted = '';
		hydrated.state.doc.descendants((node) => {
			if (!node.isText) return true;
			if (node.marks.some((mark) => mark.type.name === 'deletion')) deleted += node.text;
			if (node.marks.some((mark) => mark.type.name === 'insertion')) inserted += node.text;
			return true;
		});
		expect(deleted).toBe('');
		expect(inserted).toBe('x');
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
