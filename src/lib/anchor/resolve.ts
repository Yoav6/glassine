import type { TextQuoteSelector } from './selector';

export type ResolvedRange = { start: number; end: number };

export type ResolveResult =
	| { status: 'resolved'; range: ResolvedRange }
	| { status: 'detached' }
	| { status: 'ambiguous'; ranges: ResolvedRange[] };

export function resolveSelector(source: string, selector: TextQuoteSelector): ResolveResult {
	const { exact, prefix, suffix, offsetHint } = selector;
	if (!exact) {
		return resolveEmptyExact(source, selector);
	}

	const hintedEnd = offsetHint + exact.length;
	if (
		offsetHint >= 0 &&
		hintedEnd <= source.length &&
		source.slice(offsetHint, hintedEnd) === exact
	) {
		const prefixOk =
			!prefix || source.slice(Math.max(0, offsetHint - prefix.length), offsetHint) === prefix;
		const suffixOk = !suffix || source.slice(hintedEnd, hintedEnd + suffix.length) === suffix;
		if (prefixOk && suffixOk) {
			return { status: 'resolved', range: { start: offsetHint, end: hintedEnd } };
		}
	}

	const matches = findAll(source, exact);
	if (matches.length === 0) return { status: 'detached' };

	const scored = matches.map((start) => ({
		start,
		end: start + exact.length,
		score: scoreMatch(source, start, exact.length, prefix, suffix, offsetHint)
	}));
	scored.sort((a, b) => b.score - a.score || Math.abs(a.start - offsetHint) - Math.abs(b.start - offsetHint));

	const best = scored[0]!;
	const tied = scored.filter((m) => m.score === best.score && Math.abs(m.start - offsetHint) === Math.abs(best.start - offsetHint));
	if (tied.length > 1) {
		return { status: 'ambiguous', ranges: tied.map(({ start, end }) => ({ start, end })) };
	}
	return { status: 'resolved', range: { start: best.start, end: best.end } };
}

function resolveEmptyExact(source: string, selector: TextQuoteSelector): ResolveResult {
	if (selector.prefix && selector.suffix) {
		const from = source.indexOf(selector.prefix);
		if (from >= 0) {
			const start = from + selector.prefix.length;
			const rest = source.slice(start);
			const suf = rest.indexOf(selector.suffix);
			if (suf === 0) return { status: 'resolved', range: { start, end: start } };
		}
	}
	if (selector.offsetHint >= 0 && selector.offsetHint <= source.length) {
		return { status: 'resolved', range: { start: selector.offsetHint, end: selector.offsetHint } };
	}
	return { status: 'detached' };
}

function findAll(source: string, exact: string): number[] {
	const out: number[] = [];
	let from = 0;
	while (from <= source.length - exact.length) {
		const idx = source.indexOf(exact, from);
		if (idx < 0) break;
		out.push(idx);
		from = idx + 1;
	}
	return out;
}

function scoreMatch(
	source: string,
	start: number,
	len: number,
	prefix: string,
	suffix: string,
	offsetHint: number
): number {
	let score = 0;
	const distance = Math.abs(start - offsetHint);
	score += Math.max(0, 1000 - distance);
	if (prefix) {
		const actual = source.slice(Math.max(0, start - prefix.length), start);
		if (actual === prefix) score += 500;
		else if (actual.endsWith(prefix.slice(-Math.min(8, prefix.length)))) score += 50;
	}
	if (suffix) {
		const actual = source.slice(start + len, start + len + suffix.length);
		if (actual === suffix) score += 500;
		else if (actual.startsWith(suffix.slice(0, Math.min(8, suffix.length)))) score += 50;
	}
	return score;
}
