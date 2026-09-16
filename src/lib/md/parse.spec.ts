import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parse';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(dir, 'fixtures/reused-footnote.md'), 'utf8');

describe('parseMarkdown footnotes', () => {
	it('maps several [^1] references onto one footnote body', () => {
		const { doc, map, source } = parseMarkdown(fixture);
		const refs: { pos: number; identifier: string }[] = [];
		const notes: { pos: number; identifier: string }[] = [];
		doc.descendants((node, pos) => {
			if (node.type.name === 'footnote_ref') {
				refs.push({ pos, identifier: node.attrs.identifier as string });
			}
			if (node.type.name === 'footnote') {
				notes.push({ pos, identifier: node.attrs.identifier as string });
			}
		});
		expect(refs).toHaveLength(2);
		expect(notes).toHaveLength(1);
		expect(refs.every((r) => r.identifier === '1')).toBe(true);
		expect(notes[0]?.identifier).toBe('1');
		expect(doc.textContent).not.toContain('[^1]');
		expect(doc.textContent).not.toContain('[^1]:');

		const first = map.docToSrc(refs[0]!.pos);
		const second = map.docToSrc(refs[1]!.pos);
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		expect(first!.offset).not.toBe(second!.offset);
		expect(source.slice(first!.offset, first!.offset + 4)).toBe('[^1]');
		expect(source.slice(second!.offset, second!.offset + 4)).toBe('[^1]');

		const body = notes[0]!;
		const footnoteNode = doc.nodeAt(body.pos);
		expect(footnoteNode?.textContent).toContain('this is a footnote');
		const mappedBody = map.srcToDoc(source.indexOf('this is a footnote'));
		expect(mappedBody).not.toBeNull();
	});

	it('keeps source offsets aligned with visible text', () => {
		const { doc, map, source } = parseMarkdown(fixture);
		const needle = 'translucent paper';
		const srcAt = source.indexOf(needle);
		const mapped = map.srcToDoc(srcAt);
		expect(mapped).not.toBeNull();
		expect(doc.textBetween(mapped!.pos, mapped!.pos + needle.length)).toBe(needle);
		const back = map.docToSrc(mapped!.pos);
		expect(back?.offset).toBe(srcAt);
	});
});
