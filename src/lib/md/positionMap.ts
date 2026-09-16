export type MapSegment = {
	docPos: number;
	docLen: number;
	srcOffset: number;
	srcLen: number;
	linear: boolean;
};

export class PositionMap {
	readonly segments: MapSegment[];
	private readonly bySrc: MapSegment[];

	constructor(segments: MapSegment[]) {
		this.segments = [...segments].sort((a, b) => a.docPos - b.docPos);
		this.bySrc = [...segments].sort((a, b) => a.srcOffset - b.srcOffset);
	}

	docToSrc(pos: number): { offset: number; linear: boolean } | null {
		const seg = findContaining(this.segments, pos, (s) => s.docPos, (s) => s.docLen);
		if (!seg) return null;
		if (!seg.linear || seg.docLen !== seg.srcLen) {
			return { offset: seg.srcOffset, linear: false };
		}
		return { offset: seg.srcOffset + (pos - seg.docPos), linear: true };
	}

	srcToDoc(offset: number): { pos: number; linear: boolean } | null {
		const seg = findContaining(this.bySrc, offset, (s) => s.srcOffset, (s) => s.srcLen);
		if (!seg) return null;
		if (!seg.linear || seg.docLen !== seg.srcLen) {
			return { pos: seg.docPos, linear: false };
		}
		return { pos: seg.docPos + (offset - seg.srcOffset), linear: true };
	}

	srcRangeToDoc(start: number, end: number): { from: number; to: number; linear: boolean } | null {
		const a = this.srcToDoc(start);
		const b = this.srcToDoc(Math.max(start, end - 1));
		if (!a || !b) return null;
		const to = this.srcToDoc(end);
		const toPos = to ? to.pos : b.pos + 1;
		return { from: a.pos, to: toPos, linear: a.linear && b.linear };
	}
}

function findContaining(
	sorted: MapSegment[],
	value: number,
	startOf: (s: MapSegment) => number,
	lenOf: (s: MapSegment) => number
): MapSegment | null {
	let lo = 0;
	let hi = sorted.length - 1;
	let candidate: MapSegment | null = null;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const seg = sorted[mid]!;
		const start = startOf(seg);
		const end = start + lenOf(seg);
		if (value < start) {
			hi = mid - 1;
		} else if (value > end || (value === end && lenOf(seg) > 0)) {
			if (value === end && lenOf(seg) === 0) {
				candidate = seg;
				break;
			}
			if (value === end) {
				candidate = seg;
				lo = mid + 1;
			} else {
				lo = mid + 1;
			}
		} else {
			return seg;
		}
	}
	if (candidate) return candidate;
	for (const seg of sorted) {
		const start = startOf(seg);
		const end = start + lenOf(seg);
		if (value >= start && value <= end) return seg;
	}
	return null;
}
