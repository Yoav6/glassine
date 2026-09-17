import type { HeadingHint } from '$lib/md';
import { buildSelector, type TextQuoteSelector } from './selector';
import { resolveSelector } from './resolve';

export type Splice = {
	start: number;
	end: number;
	replacement: string;
};

export function mapRangeThroughSplice(
	range: { start: number; end: number },
	splice: Splice
): { start: number; end: number } {
	const delta = splice.replacement.length - (splice.end - splice.start);
	if (range.end <= splice.start) return range;
	if (range.start >= splice.end) {
		return { start: range.start + delta, end: range.end + delta };
	}
	const start = range.start < splice.start ? range.start : splice.start;
	const end = range.end > splice.end ? range.end + delta : splice.start + splice.replacement.length;
	return { start, end: Math.max(start, end) };
}

export function retargetSelector(
	selector: TextQuoteSelector,
	oldSource: string,
	newSource: string,
	splice: Splice,
	hintsAt: (offset: number) => HeadingHint
): TextQuoteSelector | null {
	const resolved = resolveSelector(oldSource, selector);
	if (resolved.status === 'resolved') {
		const mapped = mapRangeThroughSplice(resolved.range, splice);
		return buildSelector(newSource, mapped.start, mapped.end, hintsAt(mapped.start));
	}
	return patchSelectorText(selector, oldSource.slice(splice.start, splice.end), splice);
}

function patchSelectorText(
	selector: TextQuoteSelector,
	deleted: string,
	splice: Splice
): TextQuoteSelector | null {
	if (!deleted) return null;
	const exact = replaceOnce(selector.exact, deleted, splice.replacement);
	const prefix = replaceOnce(selector.prefix, deleted, splice.replacement);
	const suffix = replaceOnce(selector.suffix, deleted, splice.replacement);
	if (exact === selector.exact && prefix === selector.prefix && suffix === selector.suffix) return null;
	const delta = splice.replacement.length - (splice.end - splice.start);
	let offsetHint = selector.offsetHint;
	if (offsetHint >= splice.end) offsetHint += delta;
	else if (offsetHint > splice.start) offsetHint = splice.start;
	return { ...selector, exact, prefix, suffix, offsetHint };
}

function replaceOnce(haystack: string, needle: string, replacement: string): string {
	const first = haystack.indexOf(needle);
	if (first < 0) return haystack;
	if (haystack.indexOf(needle, first + 1) >= 0) return haystack;
	return haystack.slice(0, first) + replacement + haystack.slice(first + needle.length);
}
