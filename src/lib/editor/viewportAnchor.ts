import type { Node as PMNode } from 'prosemirror-model';
import type { PositionMap } from '$lib/md/positionMap';

export type ViewportAnchor = {
	srcOffset: number | null;
	needle: string;
	needleAt: number;
	viewportY: number;
	fraction: number;
};

const SNIPPET_RADIUS = 24;

export function snippetAroundPos(doc: PMNode, pos: number): { needle: string; needleAt: number } {
	const size = doc.content.size;
	const clamped = Math.max(0, Math.min(pos, size));
	let from = Math.max(0, clamped - SNIPPET_RADIUS);
	let to = Math.min(size, clamped + SNIPPET_RADIUS);
	try {
		const $pos = doc.resolve(clamped);
		if ($pos.parent.isTextblock) {
			from = Math.max($pos.start(), clamped - SNIPPET_RADIUS);
			to = Math.min($pos.end(), clamped + SNIPPET_RADIUS);
		}
	} catch {
		// pos can be unresolvable on an empty or updating doc
	}
	const needle = doc.textBetween(from, to);
	return { needle, needleAt: Math.min(needle.length, Math.max(0, clamped - from)) };
}

export function posFromNeedle(
	doc: PMNode,
	needle: string,
	needleAt: number,
	preferPos: number | null = null
): number | null {
	if (!needle) return null;
	const hits = collectNeedleHits(doc, needle, needleAt);
	if (!hits.length) {
		if (needle.length <= 8) return null;
		const from = Math.max(0, needleAt - 10);
		const to = Math.min(needle.length, needleAt + 10);
		const shorter = needle.slice(from, to);
		if (shorter === needle) return null;
		return posFromNeedle(doc, shorter, needleAt - from, preferPos);
	}
	if (preferPos == null || hits.length === 1) return hits[0]!;
	return hits.reduce((best, hit) =>
		Math.abs(hit - preferPos) < Math.abs(best - preferPos) ? hit : best
	);
}

function collectNeedleHits(doc: PMNode, needle: string, needleAt: number): number[] {
	const hits: number[] = [];
	doc.descendants((node, pos) => {
		if (!node.isText || !node.text) return;
		let start = 0;
		while (start <= node.text.length - needle.length) {
			const i = node.text.indexOf(needle, start);
			if (i < 0) break;
			hits.push(pos + i + needleAt);
			start = i + 1;
		}
	});
	return hits;
}

export function resolveAnchorPos(
	doc: PMNode,
	map: PositionMap,
	anchor: Pick<ViewportAnchor, 'srcOffset' | 'needle' | 'needleAt'>
): number | null {
	const fromSrc =
		anchor.srcOffset != null ? (map.srcToDoc(anchor.srcOffset)?.pos ?? null) : null;
	const fromNeedle = posFromNeedle(doc, anchor.needle, anchor.needleAt, fromSrc);
	return fromNeedle ?? fromSrc;
}

export function scrollDelta(currentTop: number, targetViewportY: number): number {
	return currentTop - targetViewportY;
}

export function fractionScrollDelta(
	rectTop: number,
	height: number,
	fraction: number,
	targetViewportY: number
): number {
	if (height <= 0) return 0;
	return rectTop + fraction * height - targetViewportY;
}
