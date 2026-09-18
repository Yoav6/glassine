import type { TextQuoteSelector } from './selector';
import { resolveSelector } from './resolve';

export class ApplyError extends Error {
	constructor(
		message: string,
		readonly code: 'detached' | 'ambiguous'
	) {
		super(message);
		this.name = 'ApplyError';
	}
}

export type Substitution = {
	exact: string;
	prefix: string;
	suffix: string;
	offsetHint: number;
	replacement: string;
};

export function invertSubstitution(sub: Substitution): Substitution {
	return {
		exact: sub.replacement,
		prefix: sub.prefix,
		suffix: sub.suffix,
		offsetHint: sub.offsetHint,
		replacement: sub.exact
	};
}

export function applySubstitution(
	source: string,
	sub: Substitution | (TextQuoteSelector & { replacement: string })
): { source: string; start: number; end: number } {
	const resolved = resolveSelector(source, {
		exact: sub.exact,
		prefix: sub.prefix,
		suffix: sub.suffix,
		offsetHint: sub.offsetHint,
		headingPath: 'headingPath' in sub ? sub.headingPath : '',
		paraOrdinal: 'paraOrdinal' in sub ? sub.paraOrdinal : 0
	});
	if (resolved.status === 'detached') {
		throw new ApplyError('Could not find the quoted passage in the document.', 'detached');
	}
	if (resolved.status === 'ambiguous') {
		throw new ApplyError('The quoted passage occurs more than once; refusing to guess.', 'ambiguous');
	}
	const { start, end } = resolved.range;
	return {
		source: source.slice(0, start) + sub.replacement + source.slice(end),
		start,
		end: start + sub.replacement.length
	};
}

export function applySubstitutions(
	source: string,
	subs: Substitution[]
): { source: string; applied: number } {
	const ordered = [...subs].sort((a, b) => b.offsetHint - a.offsetHint);
	let current = source;
	let applied = 0;
	for (const sub of ordered) {
		const next = applySubstitution(current, sub);
		current = next.source;
		applied += 1;
	}
	return { source: current, applied };
}
