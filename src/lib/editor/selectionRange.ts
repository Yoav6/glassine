import type { PositionMap } from '$lib/md/positionMap';

/**
 * Map a ProseMirror doc selection to a markdown source range.
 * Atom nodes (images, footnote refs) expand to their full source span.
 */
export function sourceRangeForDocSelection(
	map: PositionMap,
	from: number,
	to: number
): { start: number; end: number } | null {
	if (from === to) return null;

	const covering = map.segments.filter(
		(seg) => seg.docPos < to && seg.docPos + Math.max(seg.docLen, 1) > from
	);

	if (!covering.length) {
		const a = map.docToSrc(from);
		const b = map.docToSrc(Math.max(from, to - 1));
		if (!a || !b) return null;
		const start = Math.min(a.offset, b.offset);
		const end = Math.max(a.offset, b.offset) + 1;
		return start < end ? { start, end } : null;
	}

	let start = Infinity;
	let end = -Infinity;
	for (const seg of covering) {
		const atom = !seg.linear || seg.docLen !== seg.srcLen;
		if (atom) {
			start = Math.min(start, seg.srcOffset);
			end = Math.max(end, seg.srcOffset + seg.srcLen);
			continue;
		}
		const segFrom = Math.max(from, seg.docPos);
		const segTo = Math.min(to, seg.docPos + seg.docLen);
		start = Math.min(start, seg.srcOffset + (segFrom - seg.docPos));
		end = Math.max(end, seg.srcOffset + (segTo - seg.docPos));
	}
	return Number.isFinite(start) && start < end ? { start, end } : null;
}
