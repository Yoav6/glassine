/** Invisible paragraph body so blank lines survive markdown round-trips. */
export const BLANK_PARAGRAPH_MARK = '\u200b';

/**
 * Extra blank lines between blocks are invisible to CommonMark. Rewrite each
 * surplus break as a ZWSP-only paragraph so the article editor can show them.
 */
export function materializeBlankParagraphs(source: string): string {
	return source.replace(/\n{2,}/g, (run) => {
		const n = run.length;
		if (n <= 2) return '\n\n';
		// n=3 → one blank line; n=4 → one; n=5–6 → two; …
		const blanks = Math.max(1, Math.ceil((n - 2) / 2));
		return `\n\n${(BLANK_PARAGRAPH_MARK + '\n\n').repeat(blanks)}`;
	});
}

export function countEmptyParagraphs(doc: {
	descendants: (f: (node: { type: { name: string }; content: { size: number } }) => void) => void;
}): number {
	let count = 0;
	doc.descendants((node) => {
		if (node.type.name === 'paragraph' && node.content.size === 0) count += 1;
	});
	return count;
}

/** True when a paragraph is visually blank (empty or ZWSP-only). */
export function isBlankParagraph(node: {
	type: { name: string };
	content: { size: number };
	textContent: string;
}): boolean {
	if (node.type.name !== 'paragraph') return false;
	if (node.content.size === 0) return true;
	return node.textContent.replaceAll(BLANK_PARAGRAPH_MARK, '') === '';
}
