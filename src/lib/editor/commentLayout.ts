export type CommentLayoutItem = {
	id: string;
	desiredTop: number;
	height: number;
};

export function stackCommentTops(
	items: CommentLayoutItem[],
	opts?: { gap?: number; activeId?: string | null; minTop?: number; maxBottom?: number }
): Record<string, number> {
	const gap = opts?.gap ?? 8;
	const minTop = opts?.minTop ?? 0;
	const maxBottom = opts?.maxBottom ?? Number.POSITIVE_INFINITY;
	if (!items.length) return {};

	const sorted = [...items].sort((a, b) => a.desiredTop - b.desiredTop || a.id.localeCompare(b.id));
	const clamp = (item: CommentLayoutItem, top: number) => {
		const maxTop = Number.isFinite(maxBottom) ? maxBottom - item.height : Number.POSITIVE_INFINITY;
		return Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));
	};

	const tops = sorted.map((item) => clamp(item, item.desiredTop));
	const activeIndex = opts?.activeId ? sorted.findIndex((item) => item.id === opts.activeId) : -1;

	if (activeIndex >= 0) {
		const active = sorted[activeIndex]!;
		tops[activeIndex] = clamp(active, active.desiredTop);
		for (let i = activeIndex - 1; i >= 0; i--) {
			const item = sorted[i]!;
			const maxTop = tops[i + 1]! - gap - item.height;
			tops[i] = clamp(item, Math.min(item.desiredTop, maxTop));
		}
		for (let i = activeIndex + 1; i < sorted.length; i++) {
			const item = sorted[i]!;
			const above = sorted[i - 1]!;
			tops[i] = clamp(item, Math.max(item.desiredTop, tops[i - 1]! + above.height + gap));
		}
	} else {
		for (let i = 1; i < sorted.length; i++) {
			const item = sorted[i]!;
			const above = sorted[i - 1]!;
			tops[i] = clamp(item, Math.max(item.desiredTop, tops[i - 1]! + above.height + gap));
		}
	}

	if (Number.isFinite(maxBottom) && sorted.length) {
		const last = sorted.length - 1;
		tops[last] = Math.min(tops[last]!, Math.max(minTop, maxBottom - sorted[last]!.height));
		for (let i = last - 1; i >= 0; i--) {
			const item = sorted[i]!;
			const maxTop = tops[i + 1]! - gap - item.height;
			if (tops[i]! > maxTop) tops[i] = maxTop;
		}
		tops[0] = Math.max(tops[0]!, minTop);
		for (let i = 1; i < sorted.length; i++) {
			const above = sorted[i - 1]!;
			const minAllowed = tops[i - 1]! + above.height + gap;
			if (tops[i]! < minAllowed) tops[i] = minAllowed;
		}
	}

	const result: Record<string, number> = {};
	for (let i = 0; i < sorted.length; i++) result[sorted[i]!.id] = tops[i]!;
	return result;
}
