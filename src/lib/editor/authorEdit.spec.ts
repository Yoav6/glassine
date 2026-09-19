import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { joinBackward, splitBlock } from 'prosemirror-commands';
import { history, undo } from 'prosemirror-history';
import { EditorState, TextSelection } from 'prosemirror-state';
import { applySubstitutions } from '$lib/anchor';
import { parseMarkdown, parseSource, serializeSourceDoc } from '$lib/md';
import { schema } from '$lib/md/schema';
import { DISPLAY_TITLE_PATH } from '$lib/title';
import { displayTitlePlugin, withDisplayTitle } from './displayTitle';
import { mapTransactionToSource } from './extract';
import { hydrateAnnotations, type HydratableAnnotation } from './hydrate';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const footnoteFixture = readFileSync(
	join(fixtureDir, '../md/fixtures/reused-footnote.md'),
	'utf8'
);

function applyMapped(parsed: ReturnType<typeof parseMarkdown>, tr: import('prosemirror-state').Transaction) {
	const mapped = mapTransactionToSource(tr, parsed);
	expect(mapped.complete).toBe(true);
	if (!mapped.substitutions.length) return parsed.source;
	return applySubstitutions(parsed.source, mapped.substitutions).source;
}

describe('mapTransactionToSource', () => {
	it('inserts, deletes, and replaces a word against the markdown', () => {
		const source = 'glassine is translucent paper.\n';
		const parsed = parseMarkdown(source);
		const wordAt = parsed.map.srcToDoc(source.indexOf('translucent'))!.pos;
		const state = EditorState.create({ schema, doc: parsed.doc });

		const inserted = applyMapped(parsed, state.tr.insertText('very ', wordAt));
		expect(inserted).toBe('glassine is very translucent paper.\n');

		const deleted = applyMapped(
			parsed,
			state.tr.delete(wordAt, wordAt + 'translucent'.length)
		);
		expect(deleted).toBe('glassine is  paper.\n');

		const replaced = applyMapped(
			parsed,
			state.tr.insertText('clear', wordAt, wordAt + 'translucent'.length)
		);
		expect(replaced).toBe('glassine is clear paper.\n');
	});

	it('round-trips backspace then enter at the start of a paragraph beginning with "the"', () => {
		const source = 'Previous paragraph.\n\nthe rest of the sentence.\n';
		const parsed = parseMarkdown(source);
		const at = parsed.map.srcToDoc(source.indexOf('the rest'))!.pos;
		let state = EditorState.create({ schema, doc: parsed.doc });
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
		expect(state.doc.textBetween(at, at + 3)).toBe('the');

		let joinTr: import('prosemirror-state').Transaction | undefined;
		expect(
			joinBackward(state, (tr) => {
				joinTr = tr;
				state = state.apply(tr);
			})
		).toBe(true);
		const joinedSource = applyMapped(parsed, joinTr!);
		const joinedParsed = parseMarkdown(joinedSource);
		expect(joinedSource).toBe('Previous paragraph.the rest of the sentence.\n');

		let splitTr: import('prosemirror-state').Transaction | undefined;
		expect(
			splitBlock(state, (tr) => {
				splitTr = tr;
				state = state.apply(tr);
			})
		).toBe(true);
		expect(applyMapped(joinedParsed, splitTr!)).toBe(source);
	});

	it('round-trips that join/split when a display title is present', () => {
		const source = 'Previous paragraph.\n\nthe rest of the sentence.\n';
		const parsed = withDisplayTitle(parseMarkdown(source), 'Note title');
		const at = parsed.map.srcToDoc(source.indexOf('the rest'))!.pos;
		let state = EditorState.create({
			schema,
			doc: parsed.doc,
			plugins: [displayTitlePlugin()]
		});
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
		expect(state.doc.textBetween(at, at + 3)).toBe('the');

		let joinTr: import('prosemirror-state').Transaction | undefined;
		expect(
			joinBackward(state, (tr) => {
				joinTr = tr;
				const next = state.apply(tr);
				expect(next).not.toBe(state);
				state = next;
			})
		).toBe(true);
		expect(state.doc.childCount).toBe(2);
		const joinedSource = applyMapped(parsed, joinTr!);
		expect(joinedSource).toBe('Previous paragraph.the rest of the sentence.\n');
		const joinedParsed = withDisplayTitle(parseMarkdown(joinedSource), 'Note title');

		let splitTr: import('prosemirror-state').Transaction | undefined;
		expect(
			splitBlock(state, (tr) => {
				splitTr = tr;
				state = state.apply(tr);
			})
		).toBe(true);
		expect(applyMapped(joinedParsed, splitTr!)).toBe(source);
	});

	it('splits a paragraph with Enter and joins it back with Backspace', () => {
		const source = 'HelloWorld.\n';
		const parsed = parseMarkdown(source);
		const at = parsed.map.srcToDoc(source.indexOf('World'))!.pos;
		let state = EditorState.create({ schema, doc: parsed.doc });
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));

		let splitTr: import('prosemirror-state').Transaction | undefined;
		expect(
			splitBlock(state, (tr) => {
				splitTr = tr;
				state = state.apply(tr);
			})
		).toBe(true);
		const splitSource = applyMapped(parsed, splitTr!);
		expect(splitSource).toBe('Hello\n\nWorld.\n');

		const splitParsed = parseMarkdown(splitSource);
		state = EditorState.create({ schema, doc: splitParsed.doc });
		const worldAt = splitParsed.map.srcToDoc(splitSource.indexOf('World'))!.pos;
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, worldAt)));

		let joinTr: import('prosemirror-state').Transaction | undefined;
		expect(
			joinBackward(state, (tr) => {
				joinTr = tr;
				state = state.apply(tr);
			})
		).toBe(true);
		expect(state.doc.textContent).toBe('HelloWorld.');
		expect(applyMapped(splitParsed, joinTr!)).toBe('HelloWorld.\n');
	});

	it('edits a footnote body without touching numeric labels', () => {
		const parsed = parseMarkdown(footnoteFixture);
		const at = parsed.map.srcToDoc(parsed.source.indexOf('this is a footnote'))!.pos;
		const state = EditorState.create({ schema, doc: parsed.doc });
		const next = applyMapped(parsed, state.tr.insertText('very ', at));
		expect(next).toContain('[^1]: very this is a footnote');
		expect(next.match(/\[\^1\]/g)?.length).toBe(3);
		expect(next.match(/\[\^1\]:/g)?.length).toBe(1);
	});

	it('maps a display-title edit without splicing the body', () => {
		const body = 'Body paragraph.\n';
		const title = 'Shown title';
		const parsed = withDisplayTitle(parseMarkdown(body), title);
		const state = EditorState.create({ schema, doc: parsed.doc });
		const tr = state.tr.insertText('New ', 1);
		const mapped = mapTransactionToSource(tr, parsed);
		expect(mapped.complete).toBe(true);
		expect(mapped.substitutions).toHaveLength(1);
		expect(mapped.substitutions[0]!.headingPath).toBe(DISPLAY_TITLE_PATH);
		expect(applySubstitutions(title, mapped.substitutions).source).toBe('New Shown title');
		expect(applySubstitutions(body, mapped.substitutions.filter((item) => item.headingPath !== DISPLAY_TITLE_PATH)).source).toBe(body);
	});

	it('inverts a direct edit on undo', () => {
		const source = 'glassine is translucent paper.\n';
		const parsed = parseMarkdown(source);
		const at = parsed.map.srcToDoc(source.indexOf('translucent'))!.pos;
		let state = EditorState.create({
			schema,
			doc: parsed.doc,
			plugins: [history()]
		});
		const insertTr = state.tr.insertText('very ', at);
		state = state.apply(insertTr);
		const nextSource = applyMapped(parsed, insertTr);
		expect(nextSource).toContain('very translucent');

		let undoTr: import('prosemirror-state').Transaction | undefined;
		expect(
			undo(state, (tr) => {
				undoTr = tr;
				state = state.apply(tr);
			})
		).toBe(true);
		expect(applyMapped(parseMarkdown(nextSource), undoTr!)).toBe(source);
	});

	it('does not paint author typing as insertion marks', () => {
		const parsed = parseMarkdown('product do well\n');
		const at = parsed.map.srcToDoc(parsed.source.indexOf(' do'))!.pos;
		const state = EditorState.create({ schema, doc: parsed.doc }).apply(
			EditorState.create({ schema, doc: parsed.doc }).tr.insertText('s', at)
		);
		expect(state.doc.rangeHasMark(at, at + 1, schema.marks.insertion!)).toBe(false);
		expect(state.doc.textContent).toContain('products do well');
		const mapped = mapTransactionToSource(
			EditorState.create({ schema, doc: parsed.doc }).tr.insertText('s', at),
			parsed
		);
		expect(mapped.complete).toBe(true);
		expect(applySubstitutions(parsed.source, mapped.substitutions).source).toContain('products do well');
	});
});

describe('source-surface serialize after author edits', () => {
	it('keeps reviewer marks out of the file and includes author text', () => {
		const source = 'The cat sat.\n';
		const parsed = parseSource(source);
		const at = source.indexOf('cat');
		const suggestion: HydratableAnnotation = {
			id: 's1',
			type: 'suggestion',
			status: 'open',
			authorId: 'alice',
			highlightColor: '#7c9cff',
			replacement: 'dog',
			body: null,
			exact: 'cat',
			prefix: 'The ',
			suffix: ' sat.\n',
			offsetHint: at,
			headingPath: '',
			paraOrdinal: 1
		};
		const hydrated = hydrateAnnotations(
			EditorState.create({ schema, doc: parsed.doc }),
			parsed,
			[suggestion]
		);
		expect(serializeSourceDoc(hydrated.state.doc)).toBe(source);
		const edited = hydrated.state.apply(hydrated.state.tr.insertText('Oh, ', 1));
		expect(serializeSourceDoc(edited.doc)).toBe('Oh, The cat sat.\n');
	});
});
