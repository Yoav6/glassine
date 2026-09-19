import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parse';
import {
	BLANK_PARAGRAPH_MARK,
	materializeBlankParagraphs
} from './blankLines';

describe('materializeBlankParagraphs', () => {
	it('leaves a single paragraph break alone', () => {
		expect(materializeBlankParagraphs('a\n\nb\n')).toBe('a\n\nb\n');
	});

	it('turns extra blank lines into ZWSP paragraphs', () => {
		expect(materializeBlankParagraphs('a\n\n\n\nb\n')).toBe(
			`a\n\n${BLANK_PARAGRAPH_MARK}\n\nb\n`
		);
		const parsed = parseMarkdown('Test\n\n\n\n\n\ntest\n');
		const blanks: string[] = [];
		parsed.doc.forEach((node) => {
			if (node.type.name === 'paragraph') blanks.push(node.textContent);
		});
		expect(blanks[0]).toBe('Test');
		expect(blanks.at(-1)).toBe('test');
		expect(blanks.slice(1, -1).every((text) => text === BLANK_PARAGRAPH_MARK)).toBe(true);
		expect(blanks.length).toBeGreaterThan(2);
	});
});
