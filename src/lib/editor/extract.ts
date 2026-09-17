import type { Node } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { buildSelector, widenToWords, type TextQuoteSelector } from '$lib/anchor';
import type { ParseResult } from '$lib/md';

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
	const deletions = ordered.filter((s) => s.kind === 'deletion');
	const insertions = ordered.filter((s) => s.kind === 'insertion');
	const boundaries = ordered.filter((s) => s.kind === 'boundary');

	const deletedText = deletions.map((s) => s.text).join('');
	const insertedText = insertions.map((s) => s.text).join('');

	let cleanFrom = toCleanPos(doc, first.from);
	let cleanTo = toCleanPos(doc, ordered[ordered.length - 1]!.to);

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

	if (!deletedText && insertedText) {
		const widened = widenToWords(parsed.source, Math.max(0, mapToSrc(parsed, cleanFrom)), mapToSrc(parsed, cleanFrom));
		const exact = parsed.source.slice(widened.start, widened.end);
		const replacement = insertedText + exact;
		const hint = parsed.hintsAt(widened.start);
		return {
			id,
			authorId: first.authorId,
			highlightColor: first.highlightColor,
			...buildSelector(parsed.source, widened.start, widened.end, hint),
			replacement
		};
	}

	if (deletedText && !insertedText) {
		const srcStart = mapToSrc(parsed, cleanFrom);
		const idx = parsed.source.indexOf(deletedText, Math.max(0, srcStart - deletedText.length));
		const start = idx >= 0 ? idx : srcStart;
		const hint = parsed.hintsAt(start);
		return {
			id,
			authorId: first.authorId,
			highlightColor: first.highlightColor,
			...buildSelector(parsed.source, start, start + deletedText.length, hint),
			replacement: ''
		};
	}

	if (deletedText && insertedText) {
		const srcStart = mapToSrc(parsed, cleanFrom);
		const idx = parsed.source.indexOf(deletedText, Math.max(0, srcStart - 8));
		const start = idx >= 0 ? idx : srcStart;
		const hint = parsed.hintsAt(start);
		return {
			id,
			authorId: first.authorId,
			highlightColor: first.highlightColor,
			...buildSelector(parsed.source, start, start + deletedText.length, hint),
			replacement: insertedText
		};
	}

	void cleanTo;
	return null;
}

function paragraphJoinQuote(
	source: string,
	parsed: ParseResult,
	cleanPos: number
): { selector: TextQuoteSelector; replacement: string } | null {
	const srcPos = mapToSrc(parsed, cleanPos);
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

function mapToSrc(parsed: ParseResult, cleanPos: number): number {
	return parsed.map.docToSrc(cleanPos)?.offset ?? 0;
}

/**
 * Turn a document-changing transaction (typically undo/redo after author
 * auto-accept) into quote substitutions against the last saved source.
 * Ranges that only cover unsaved insertion marks collapse to a no-op.
 */
export function substitutionsFromTransaction(
	tr: Transaction,
	parsed: ParseResult
): ExtractedSuggestion[] {
	if (!tr.docChanged) return [];
	const out: ExtractedSuggestion[] = [];
	for (let i = 0; i < tr.steps.length; i++) {
		const step = tr.steps[i]!;
		if (!(step instanceof ReplaceStep)) continue;
		const doc = tr.docs[i]!;
		const deleted = doc.textBetween(step.from, step.to, '\n', '');
		const inserted = step.slice.content.textBetween(0, step.slice.content.size, '\n', '');
		if (deleted === inserted) continue;

		let from = step.from;
		let to = step.to;
		for (let j = i - 1; j >= 0; j--) {
			const inv = tr.steps[j]!.getMap().invert();
			from = inv.map(from, 1);
			to = inv.map(to, -1);
		}
		const startDoc = tr.docs[0] ?? doc;
		const cleanFrom = toCleanPos(startDoc, from);
		const cleanTo = toCleanPos(startDoc, to);
		if (cleanFrom === cleanTo && !inserted) continue;

		const srcStart = mapToSrc(parsed, cleanFrom);
		const sub = substitutionFromReplace(parsed, srcStart, deleted, inserted);
		if (sub) out.push(sub);
	}
	return out;
}

function substitutionFromReplace(
	parsed: ParseResult,
	srcStart: number,
	deleted: string,
	inserted: string
): ExtractedSuggestion | null {
	if (!deleted && !inserted) return null;

	if (!deleted && inserted) {
		const widened = widenToWords(parsed.source, Math.max(0, srcStart), Math.max(0, srcStart));
		const exact = parsed.source.slice(widened.start, widened.end);
		const inner = Math.max(0, Math.min(exact.length, srcStart - widened.start));
		const replacement = exact.slice(0, inner) + inserted + exact.slice(inner);
		if (exact === replacement) return null;
		const hint = parsed.hintsAt(widened.start);
		return {
			id: crypto.randomUUID(),
			authorId: null,
			highlightColor: null,
			...buildSelector(parsed.source, widened.start, widened.end, hint),
			replacement
		};
	}

	const idx = parsed.source.indexOf(deleted, Math.max(0, srcStart - deleted.length));
	const start = idx >= 0 ? idx : srcStart;
	const hint = parsed.hintsAt(start);
	return {
		id: crypto.randomUUID(),
		authorId: null,
		highlightColor: null,
		...buildSelector(parsed.source, start, start + deleted.length, hint),
		replacement: inserted
	};
}
