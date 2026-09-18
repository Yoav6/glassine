import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '$lib/md';
import { schema } from '$lib/md/schema';
import {
	collectFootnoteRefs,
	findFootnotePos,
	findFootnoteRefPos,
	footnoteDecorations,
	footnoteDomId,
	footnoteRefDomId,
	footnotes
} from './footnotes';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(dir, '../md/fixtures/reused-footnote.md'), 'utf8');

function widgetKeys(doc = parseMarkdown(fixture).doc) {
	return footnoteDecorations(doc)
		.map((deco) => deco.spec.key as string | undefined)
		.filter((key): key is string => Boolean(key));
}

describe('footnote navigation', () => {
	it('assigns one backref arrow per in-text reference, in document order', () => {
		const { doc } = parseMarkdown(fixture);
		const refs = collectFootnoteRefs(doc);
		expect(refs).toHaveLength(2);
		expect(refs.map((ref) => ref.index)).toEqual([0, 1]);
		expect(widgetKeys(doc)).toEqual(['fn-backref-1-0', 'fn-backref-1-1']);
		expect(footnoteRefDomId('1', 0)).toBe('fnref-1');
		expect(footnoteRefDomId('1', 1)).toBe('fnref-1-2');
		expect(footnoteDomId('1')).toBe('fn-1');
	});

	it('places every backref at the end of the shared footnote body', () => {
		const { doc } = parseMarkdown(fixture);
		const widgets = footnoteDecorations(doc).filter((deco) => deco.spec.key);
		expect(widgets).toHaveLength(2);
		expect(widgets[0]?.from).toBe(widgets[1]?.from);
		const notePos = findFootnotePos(doc, '1');
		expect(notePos).not.toBeNull();
		const note = doc.nodeAt(notePos!);
		expect(note?.type.name).toBe('footnote');
		expect(widgets[0]?.from).toBe(notePos! + note!.nodeSize - 2);
	});

	it('resolves each arrow to the matching superscript', () => {
		const { doc } = parseMarkdown(fixture);
		const refs = collectFootnoteRefs(doc);
		expect(findFootnoteRefPos(doc, '1', 0)).toBe(refs[0]?.pos);
		expect(findFootnoteRefPos(doc, '1', 1)).toBe(refs[1]?.pos);
		expect(findFootnoteRefPos(doc, '1', 2)).toBeNull();
	});

	it('keeps arrows for distinct labels separate', () => {
		const { doc } = parseMarkdown('One[^1] two[^2] three[^1].\n\n[^1]: first\n\n[^2]: second\n');
		expect(widgetKeys(doc)).toEqual(['fn-backref-1-0', 'fn-backref-1-1', 'fn-backref-2-0']);
	});

	it('does not treat a footnote marker as a selectable node', () => {
		expect(schema.nodes.footnote_ref?.spec.selectable).toBe(false);
		const { doc } = parseMarkdown(fixture);
		const state = EditorState.create({ schema, doc, plugins: [footnotes()] });
		const plugin = state.plugins.find((item) => item.props.handleDOMEvents?.click);
		expect(plugin?.props.handleDOMEvents?.click).toBeTypeOf('function');
		expect(plugin?.props.handleDOMEvents?.mousedown).toBeTypeOf('function');
	});
});
