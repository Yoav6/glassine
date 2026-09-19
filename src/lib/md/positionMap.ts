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
			// Exclusive end of an atom maps to the source after it (not the start).
			if (pos >= seg.docPos + seg.docLen) {
				return { offset: seg.srcOffset + seg.srcLen, linear: false };
			}
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
		const fromOff = Number(start);
		const toOff = Number(end);
		if (!Number.isFinite(fromOff) || !Number.isFinite(toOff) || fromOff >= toOff) {
			const a = this.srcToDoc(Number.isFinite(fromOff) ? fromOff : toOff);
			if (!a) return null;
			return { from: a.pos, to: a.pos, linear: a.linear };
		}

		const covering = this.bySrc.filter(
			(seg) => seg.srcOffset < toOff && seg.srcOffset + seg.srcLen > fromOff
		);
		if (covering.some((seg) => !seg.linear || seg.docLen !== seg.srcLen)) {
			let from = Infinity;
			let to = -Infinity;
			let linear = true;
			for (const seg of covering) {
				const atom = !seg.linear || seg.docLen !== seg.srcLen;
				if (atom) {
					from = Math.min(from, seg.docPos);
					to = Math.max(to, seg.docPos + seg.docLen);
					linear = false;
					continue;
				}
				const segStart = Math.max(fromOff, seg.srcOffset);
				const segEnd = Math.min(toOff, seg.srcOffset + seg.srcLen);
				from = Math.min(from, seg.docPos + (segStart - seg.srcOffset));
				to = Math.max(to, seg.docPos + (segEnd - seg.srcOffset));
			}
			if (!Number.isFinite(from) || from >= to) return null;
			return { from, to, linear };
		}

		const a = this.srcToDoc(fromOff);
		const b = this.srcToDoc(Math.max(fromOff, toOff - 1));
		if (!a || !b) return null;
		const to = this.srcToDoc(toOff);
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
