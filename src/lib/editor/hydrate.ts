import { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { resolveSelector, type TextQuoteSelector } from '$lib/anchor';
import type { ParseResult } from '$lib/md';
import { acceptSuggestionMarks } from './accept';

export type HydratableAnnotation = {
	id: string;
	type: 'comment' | 'suggestion';
	status: string;
	detached?: boolean;
	authorId: string;
	authorName?: string;
	parentId?: string | null;
	highlightColor: string | null;
	exact: string;
	prefix: string;
	suffix: string;
	offsetHint: number;
	headingPath: string;
	paraOrdinal: number;
	replacement: string | null;
	body: string | null;
};

export type CommentRange = {
	id: string;
	from: number;
	to: number;
	color: string | null;
	authorId: string;
};

export type HydrateResult = {
	state: EditorState;
	inline: HydratableAnnotation[];
	detached: HydratableAnnotation[];
	overlapping: HydratableAnnotation[];
	commentRanges: CommentRange[];
};

export function hydrateAnnotations(
	base: EditorState,
	parsed: ParseResult,
	annotations: HydratableAnnotation[]
): HydrateResult {
	const pending = annotations.filter((a) => a.status === 'open');
	const alreadyDetached = pending.filter((a) => a.detached);
	const live = pending.filter((a) => !a.detached);
	const detached: HydratableAnnotation[] = [...alreadyDetached];
	const overlapping: HydratableAnnotation[] = [];
	const inline: HydratableAnnotation[] = [];
	const commentRanges: CommentRange[] = [];
	const taken: { start: number; end: number }[] = [];

	const resolvedSuggestions = live
		.filter((a) => a.type === 'suggestion')
		.map((a) => ({ a, resolved: resolveSelector(parsed.source, selectorOf(a)) }))
		.sort((x, y) => srcStart(y) - srcStart(x));

	let state = base;

	for (const { a, resolved } of resolvedSuggestions) {
		if (resolved.status !== 'resolved') {
			detached.push(a);
			continue;
		}
		if (taken.some((t) => overlaps(t.start, t.end, resolved.range.start, resolved.range.end))) {
			overlapping.push(a);
			continue;
		}
		const mapped = parsed.map.srcRangeToDoc(resolved.range.start, resolved.range.end);
		if (!mapped) {
			detached.push(a);
			continue;
		}
		try {
			const insertOnly = !a.exact;
			const from = mapped.from;
			const to = insertOnly ? mapped.from : mapped.to;
			state = applySuggestionMarks(state, from, to, a);
			taken.push(resolved.range);
			inline.push(a);
		} catch {
			detached.push(a);
		}
	}

	for (const a of live.filter((row) => row.type === 'comment' && !row.parentId)) {
		const resolved = resolveSelector(parsed.source, selectorOf(a));
		if (resolved.status !== 'resolved') {
			detached.push(a);
			continue;
		}
		const mapped = parsed.map.srcRangeToDoc(resolved.range.start, resolved.range.end);
		if (!mapped) {
			detached.push(a);
			continue;
		}
		commentRanges.push({
			id: a.id,
			from: mapped.from,
			to: mapped.to,
			color: a.highlightColor,
			authorId: a.authorId
		});
		inline.push(a);
	}

	return { state, inline, detached, overlapping, commentRanges };
}

/** Read-only preview: apply visible suggestion marks as if they were accepted. */
export function previewAcceptedDocument(
	base: EditorState,
	parsed: ParseResult,
	annotations: HydratableAnnotation[]
): { doc: Node; inline: HydratableAnnotation[]; detached: HydratableAnnotation[]; overlapping: HydratableAnnotation[] } {
	const suggestions = annotations.filter((a) => a.type === 'suggestion');
	const hydrated = hydrateAnnotations(base, parsed, suggestions);
	const tr = acceptSuggestionMarks(
		hydrated.state,
		hydrated.inline.map((item) => item.id)
	);
	return {
		doc: tr ? tr.doc : hydrated.state.doc,
		inline: hydrated.inline,
		detached: hydrated.detached,
		overlapping: hydrated.overlapping
	};
}

function applySuggestionMarks(
	state: EditorState,
	from: number,
	to: number,
	a: HydratableAnnotation
): EditorState {
	const deletion = state.schema.marks.deletion;
	const insertion = state.schema.marks.insertion;
	if (!deletion || !insertion) return state;
	const attrs = {
		id: a.id,
		authorId: a.authorId,
		highlightColor: a.highlightColor
	};
	let tr = state.tr;
	if (from < to && a.exact) {
		tr = tr.addMark(from, to, deletion.create(attrs));
	}
	if (a.replacement) {
		const insMark = insertion.create(attrs);
		const at = from < to && a.exact ? to : from;
		tr = tr.insert(at, state.schema.text(a.replacement, [insMark]));
	}
	return state.apply(tr);
}

function selectorOf(a: HydratableAnnotation): TextQuoteSelector {
	return {
		exact: a.exact,
		prefix: a.prefix,
		suffix: a.suffix,
		offsetHint: a.offsetHint,
		headingPath: a.headingPath,
		paraOrdinal: a.paraOrdinal
	};
}

function srcStart(entry: { resolved: ReturnType<typeof resolveSelector> }): number {
	return entry.resolved.status === 'resolved' ? entry.resolved.range.start : -1;
}

function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
	return a1 < b2 && b1 < a2;
}
