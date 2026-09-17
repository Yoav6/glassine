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
