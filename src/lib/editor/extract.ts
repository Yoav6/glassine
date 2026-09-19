import type { Node } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { buildSelector, resolveSelector, type TextQuoteSelector } from '$lib/anchor';
import type { ParseResult } from '$lib/md';
import { BLANK_PARAGRAPH_MARK, countEmptyParagraphs } from '$lib/md/blankLines';
import { displayTitleHint, isDisplayTitleSelector } from '$lib/title';
import { baseDisplayTitle, docPosToTitleOffset, posInDisplayTitle } from './displayTitle';

export type ExtractedSuggestion = TextQuoteSelector & {
	id: string;
	authorId: string | null;
	highlightColor: string | null;
	replacement: string;
};

type MarkedSpan = {
	id: string;
	authorId: string | null;
	highlightColor: string | null;
	kind: 'insertion' | 'deletion' | 'boundary';
	from: number;
	to: number;
	text: string;
	boundaryType?: string | null;
};

export function extractSuggestions(
	state: EditorState,
	parsed: ParseResult,
	knownIds: Set<string>
): ExtractedSuggestion[] {
	const spans = collectSpans(state.doc);
	const byId = new Map<string, MarkedSpan[]>();
	for (const span of spans) {
		if (knownIds.has(span.id)) continue;
		const list = byId.get(span.id) ?? [];
		list.push(span);
		byId.set(span.id, list);
	}

	const out: ExtractedSuggestion[] = [];
	for (const [id, group] of byId) {
		const extracted = extractGroup(id, group, state.doc, parsed);
		if (extracted) out.push(extracted);
	}
	return out;
}

export type SuggestionQuote = TextQuoteSelector & {
	id: string;
	authorId: string | null;
	replacement: string | null;
};

export function suggestionQuotesTouch(
	source: string,
	a: TextQuoteSelector,
	b: TextQuoteSelector,
	title = ''
): boolean {
	if (isDisplayTitleSelector(a) !== isDisplayTitleSelector(b)) return false;
	const hay = isDisplayTitleSelector(a) ? title : source;
	const ra = resolveSelector(hay, a);
	const rb = resolveSelector(hay, b);
	if (ra.status === 'resolved' && rb.status === 'resolved') {
		return ra.range.start <= rb.range.end && rb.range.start <= ra.range.end;
	}
	const aEnd = a.offsetHint + a.exact.length;
	const bEnd = b.offsetHint + b.exact.length;
	return a.offsetHint <= bEnd && b.offsetHint <= aEnd;
}

function suggestionContentChanged(prev: SuggestionQuote, next: ExtractedSuggestion): boolean {
	return (
		prev.exact !== next.exact ||
		(prev.replacement ?? '') !== next.replacement ||
		prev.prefix !== next.prefix ||
		prev.suffix !== next.suffix ||
		prev.offsetHint !== next.offsetHint
	);
}

/**
 * Persist in-place edits to the current user's suggestions, and fold a new
 * mark id onto an overlapping suggestion they already own instead of creating
 * a second, conflicting annotation.
 */
export function persistableSuggestions(opts: {
	live: ExtractedSuggestion[];
	knownIds: Set<string>;
	existing: SuggestionQuote[];
	userId: string;
	source: string;
	title?: string;
}): { upserts: ExtractedSuggestion[]; relabels: { from: string; to: string }[] } {
	const mine = opts.live.filter((item) => !item.authorId || item.authorId === opts.userId);
	const liveIds = new Set(mine.map((item) => item.id));
	const ownExisting = opts.existing.filter((item) => item.authorId === opts.userId);
	const upserts: ExtractedSuggestion[] = [];
	const relabels: { from: string; to: string }[] = [];
	const title = opts.title ?? '';

	for (const item of mine) {
		if (opts.knownIds.has(item.id)) {
			const prev = ownExisting.find((row) => row.id === item.id);
			if (!prev || suggestionContentChanged(prev, item)) upserts.push(item);
			continue;
		}

		const foldInto = ownExisting.find(
			(row) =>
				row.id !== item.id &&
				!liveIds.has(row.id) &&
				suggestionQuotesTouch(opts.source, item, row, title)
		) ?? ownExisting.find(
			(row) => row.id !== item.id && suggestionQuotesTouch(opts.source, item, row, title)
		);

		if (foldInto) {
			upserts.push({ ...item, id: foldInto.id });
			relabels.push({ from: item.id, to: foldInto.id });
		} else {
			upserts.push(item);
		}
	}

	return { upserts, relabels };
}

function collectSpans(doc: Node): MarkedSpan[] {
	const spans: MarkedSpan[] = [];
	doc.descendants((node, pos) => {
		const marks = node.isText ? node.marks : node.marks;
		for (const mark of marks) {
			if (
				mark.type.name !== 'insertion' &&
				mark.type.name !== 'deletion' &&
				mark.type.name !== 'blockBoundarySuggestion'
			) {
				continue;
			}
			const id = String(mark.attrs.id ?? '');
			if (!id) continue;
			spans.push({
				id,
				authorId: (mark.attrs.authorId as string | null) ?? null,
				highlightColor: (mark.attrs.highlightColor as string | null) ?? null,
				kind:
					mark.type.name === 'insertion'
						? 'insertion'
						: mark.type.name === 'deletion'
							? 'deletion'
							: 'boundary',
				from: pos,
				to: pos + node.nodeSize,
				text: node.isText ? (node.text ?? '') : '',
				boundaryType: (mark.attrs.type as string | null) ?? null
			});
		}
		return true;
	});
	return spans;
}

function extractGroup(
	id: string,
	group: MarkedSpan[],
	doc: Node,
	parsed: ParseResult
): ExtractedSuggestion | null {
	const ordered = [...group].sort((a, b) => a.from - b.from);
	const first = ordered[0]!;
	if (posInDisplayTitle(doc, first.from)) {
		return extractTitleGroup(id, ordered, doc, first);
	}
	const deletions = ordered.filter((s) => s.kind === 'deletion');
	const insertions = ordered.filter((s) => s.kind === 'insertion');
	const boundaries = ordered.filter((s) => s.kind === 'boundary');

	const deletedText = deletions.map((s) => s.text).join('');
	const insertedText = insertions.map((s) => s.text).join('');

	let cleanFrom = toCleanPos(doc, first.from);

	if (boundaries.some((b) => b.boundaryType === 'deletion')) {
		const around = paragraphJoinQuote(parsed.source, parsed, cleanFrom);
		if (around) {
			return {
				id,
				authorId: first.authorId,
				highlightColor: first.highlightColor,
				...around.selector,
				replacement: around.replacement
			};
		}
	}

	const quote = bodyQuoteAt(parsed, cleanFrom, deletedText, insertedText);
	if (!quote) return null;
	return {
		id,
		authorId: first.authorId,
		highlightColor: first.highlightColor,
		...quote
	};
}

function bodyQuoteAt(
	parsed: ParseResult,
	cleanFrom: number,
	deletedText: string,
	insertedText: string
): (TextQuoteSelector & { replacement: string }) | null {
	if (!deletedText && !insertedText) return null;
	const mapped = parsed.map.docToSrc(cleanFrom);
	if (!mapped) return null;
	const at = clampOffset(parsed.source, mapped.offset);
	const hint = parsed.hintsAt(at);
	if (!deletedText) {
		return { ...buildSelector(parsed.source, at, at, hint), replacement: insertedText };
	}
	return {
		...buildSelector(parsed.source, at, at + deletedText.length, hint),
		replacement: insertedText
	};
}

function extractTitleGroup(
	id: string,
	ordered: MarkedSpan[],
	doc: Node,
	first: MarkedSpan
): ExtractedSuggestion | null {
	const deletions = ordered.filter((s) => s.kind === 'deletion');
	const insertions = ordered.filter((s) => s.kind === 'insertion');
	const deletedText = deletions.map((s) => s.text).join('');
	const insertedText = insertions.map((s) => s.text).join('');
	const title = baseDisplayTitle(doc);
	const start = Math.min(title.length, docPosToTitleOffset(doc, first.from));
	const hint = displayTitleHint();
	if (!deletedText && insertedText) {
		return {
			id,
			authorId: first.authorId,
			highlightColor: first.highlightColor,
			...buildSelector(title, start, start, hint),
			replacement: insertedText
		};
	}
	if (deletedText) {
		return {
			id,
			authorId: first.authorId,
			highlightColor: first.highlightColor,
			...buildSelector(title, start, start + deletedText.length, hint),
			replacement: insertedText
		};
	}
	return null;
}

function paragraphJoinQuote(
	source: string,
	parsed: ParseResult,
	cleanPos: number
): { selector: TextQuoteSelector; replacement: string } | null {
	const srcPos = parsed.map.docToSrc(cleanPos)?.offset;
	if (srcPos == null) return null;
	const breakAt = findNearbyBreak(source, srcPos);
	if (breakAt.start === breakAt.end) return null;
	const exact = source.slice(breakAt.start, breakAt.end);
	const hint = parsed.hintsAt(breakAt.start);
	return {
		selector: buildSelector(source, breakAt.start, breakAt.end, hint),
		replacement: exact.includes('\n\n') ? ' ' : ''
	};
}

function findNearbyBreak(source: string, around: number): { start: number; end: number } {
	const windowStart = Math.max(0, around - 80);
	const slice = source.slice(windowStart, around + 80);
	const double = slice.indexOf('\n\n');
	if (double >= 0) {
		return { start: windowStart + double, end: windowStart + double + 2 };
	}
	const single = slice.indexOf('\n');
	if (single >= 0) {
		return { start: windowStart + single, end: windowStart + single + 1 };
	}
	return { start: Math.max(0, around), end: Math.max(0, around) };
}

function toCleanPos(doc: Node, pos: number): number {
	let shift = 0;
	doc.nodesBetween(0, pos, (node, nodePos) => {
		if (!node.isText) return true;
		if (!node.marks.some((m) => m.type.name === 'insertion')) return false;
		const from = Math.max(nodePos, 0);
		const to = Math.min(nodePos + node.nodeSize, pos);
		shift += Math.max(0, to - from);
		return false;
	});
	return Math.max(0, pos - shift);
}

function clampOffset(source: string, offset: number): number {
	return Math.max(0, Math.min(source.length, offset));
}

function isStructuralSplit(step: ReplaceStep): boolean {
	if (step.from !== step.to) return false;
	if (step.slice.openStart >= 1) return true;
	let hasBlock = false;
	step.slice.content.forEach((node) => {
		if (node.isBlock) hasBlock = true;
	});
	return hasBlock;
}

function blockSeparatorAt(doc: Node, pos: number): string {
	const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
	for (let depth = $pos.depth; depth > 0; depth--) {
		const name = $pos.node(depth).type.name;
		if (name === 'list_item' || name === 'code_block') return '\n';
	}
	return '\n\n';
}

function srcOffsetAt(parsed: ParseResult, cleanPos: number): number | null {
	const mapped = parsed.map.docToSrc(cleanPos);
	if (mapped) return mapped.offset;
	let before: { srcOffset: number; srcLen: number; docPos: number; docLen: number } | null = null;
	let after: { srcOffset: number; docPos: number } | null = null;
	for (const seg of parsed.map.segments) {
		if (seg.docPos + seg.docLen <= cleanPos) before = seg;
		if (!after && seg.docPos >= cleanPos) after = seg;
	}
	if (before && before.docPos + before.docLen === cleanPos) {
		return before.srcOffset + before.srcLen;
	}
	if (after && after.docPos === cleanPos) return after.srcOffset;
	if (before) return before.srcOffset + before.srcLen;
	if (after) return after.srcOffset;
	if (!parsed.source.length && cleanPos >= 0) return 0;
	return null;
}

function mapReplaceStep(opts: {
	parsed: ParseResult;
	startDoc: Node;
	stepDoc: Node;
	step: ReplaceStep;
	from: number;
	to: number;
	deleted: string;
	inserted: string;
}): ExtractedSuggestion | 'skip' | 'fail' {
	const { parsed, startDoc, stepDoc, step, from, to, deleted, inserted } = opts;
	if (posInDisplayTitle(startDoc, from)) {
		const title = baseDisplayTitle(startDoc);
		const at = docPosToTitleOffset(startDoc, from);
		if (deleted === inserted) return 'skip';
		const sub = substitutionFromHaystack(title, at, deleted, inserted, displayTitleHint());
		return sub ?? 'skip';
	}

	const cleanFrom = toCleanPos(startDoc, from);
	const cleanTo = toCleanPos(startDoc, to);
	const split = isStructuralSplit(step);

	if (split) {
		const src = srcOffsetAt(parsed, cleanFrom);
		if (src == null) return 'fail';
		const sep = blockSeparatorAt(stepDoc, step.from);
		const applied = step.apply(stepDoc);
		const createdBlank =
			!applied.failed &&
			countEmptyParagraphs(applied.doc) > countEmptyParagraphs(stepDoc);
		const insertion = createdBlank ? `${sep}${BLANK_PARAGRAPH_MARK}` : sep;
		const sub = substitutionFromHaystack(
			parsed.source,
			src,
			'',
			insertion,
			parsed.hintsAt(src)
		);
		return sub ?? 'fail';
	}

	if (cleanFrom === cleanTo && !inserted) return 'skip';
	if (deleted === inserted && cleanFrom === cleanTo) return 'skip';

	const srcFrom = srcOffsetAt(parsed, cleanFrom);
	const srcTo = srcOffsetAt(parsed, Math.max(cleanFrom, cleanTo));
	if (srcFrom == null || srcTo == null) {
		const srcStart = parsed.map.docToSrc(cleanFrom)?.offset;
		if (srcStart == null) return deleted || inserted ? 'fail' : 'skip';
		const sub = substitutionFromHaystack(
			parsed.source,
			srcStart,
			deleted,
			inserted,
			parsed.hintsAt(srcStart)
		);
		return sub ?? 'skip';
	}
	if (srcFrom > srcTo) return 'fail';
	if (srcFrom === srcTo && !inserted) return 'skip';

	const exact = parsed.source.slice(srcFrom, srcTo);
	const sub = substitutionFromHaystack(
		parsed.source,
		srcFrom,
		exact,
		inserted,
		parsed.hintsAt(srcFrom)
	);
	return sub ?? 'skip';
}

export type SourceMapping = {
	substitutions: ExtractedSuggestion[];
	complete: boolean;
};

/**
 * Turn a document-changing transaction into quote substitutions against the
 * working source. Ranges that only cover unsaved insertion marks collapse to
 * a no-op. Structural split/join maps onto the markdown break between blocks.
 */
export function mapTransactionToSource(tr: Transaction, parsed: ParseResult): SourceMapping {
	if (!tr.docChanged) return { substitutions: [], complete: true };
	const substitutions: ExtractedSuggestion[] = [];
	for (let i = 0; i < tr.steps.length; i++) {
		const step = tr.steps[i]!;
		if (!(step instanceof ReplaceStep)) continue;
		const doc = tr.docs[i]!;
		const deleted = doc.textBetween(step.from, step.to, '\n', '');
		const inserted = step.slice.content.textBetween(0, step.slice.content.size, '\n', '');

		let from = step.from;
		let to = step.to;
		for (let j = i - 1; j >= 0; j--) {
			const inv = tr.steps[j]!.getMap().invert();
			from = inv.map(from, 1);
			to = inv.map(to, -1);
		}
		const startDoc = tr.docs[0] ?? doc;
		const mapped = mapReplaceStep({
			parsed,
			startDoc,
			stepDoc: doc,
			step,
			from,
			to,
			deleted,
			inserted
		});
		if (mapped === 'fail') return { substitutions, complete: false };
		if (mapped === 'skip') continue;
		substitutions.push(mapped);
	}
	return { substitutions, complete: true };
}

/**
 * Turn a document-changing transaction into quote substitutions against the
 * working source. Ranges that only cover unsaved insertion marks collapse to
 * a no-op.
 */
export function substitutionsFromTransaction(
	tr: Transaction,
	parsed: ParseResult
): ExtractedSuggestion[] {
	return mapTransactionToSource(tr, parsed).substitutions;
}

function substitutionFromHaystack(
	haystack: string,
	start: number,
	deleted: string,
	inserted: string,
	hint: { path: string; paraOrdinal: number }
): ExtractedSuggestion | null {
	if (!deleted && !inserted) return null;
	const at = clampOffset(haystack, start);
	if (!deleted) {
		return {
			id: crypto.randomUUID(),
			authorId: null,
			highlightColor: null,
			...buildSelector(haystack, at, at, hint),
			replacement: inserted
		};
	}
	return {
		id: crypto.randomUUID(),
		authorId: null,
		highlightColor: null,
		...buildSelector(haystack, at, at + deleted.length, hint),
		replacement: inserted
	};
}
