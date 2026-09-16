import type { HeadingHint } from '$lib/md';

export const CONTEXT_CHARS = 32;

export type TextQuoteSelector = {
	exact: string;
	prefix: string;
	suffix: string;
	offsetHint: number;
	headingPath: string;
	paraOrdinal: number;
};

export function buildSelector(
	source: string,
	start: number,
	end: number,
	hint: HeadingHint
): TextQuoteSelector {
	const from = Math.max(0, Math.min(start, end));
	const to = Math.max(from, Math.max(start, end));
	return {
		exact: source.slice(from, to),
		prefix: source.slice(Math.max(0, from - CONTEXT_CHARS), from),
		suffix: source.slice(to, Math.min(source.length, to + CONTEXT_CHARS)),
		offsetHint: from,
		headingPath: hint.path,
		paraOrdinal: hint.paraOrdinal
	};
}

export function widenToWords(source: string, start: number, end: number): { start: number; end: number } {
	let from = start;
	let to = end;
	while (from > 0 && isWordChar(source[from - 1]!)) from -= 1;
	while (to < source.length && isWordChar(source[to]!)) to += 1;
	if (from === to) {
		if (from > 0) from -= 1;
		else if (to < source.length) to += 1;
	}
	return { start: from, end: to };
}

function isWordChar(ch: string): boolean {
	return /[\p{L}\p{N}_-]/u.test(ch);
}
