import { describe, expect, it } from 'vitest';
import { stackCommentTops } from './commentLayout';

describe('stackCommentTops', () => {
	it('keeps items at their desired top when they do not overlap', () => {
		expect(
			stackCommentTops([
				{ id: 'a', desiredTop: 0, height: 40 },
				{ id: 'b', desiredTop: 100, height: 40 }
			])
		).toEqual({ a: 0, b: 100 });
	});

	it('pushes later items down when they would overlap', () => {
		expect(
			stackCommentTops(
				[
					{ id: 'a', desiredTop: 0, height: 50 },
					{ id: 'b', desiredTop: 20, height: 50 }
				],
				{ gap: 8 }
			)
		).toEqual({ a: 0, b: 58 });
	});

	it('pins the active item to its desired top and stacks neighbors around it', () => {
		const tops = stackCommentTops(
			[
				{ id: 'a', desiredTop: 80, height: 50 },
				{ id: 'b', desiredTop: 100, height: 50 },
				{ id: 'c', desiredTop: 300, height: 40 }
			],
			{ gap: 8, activeId: 'b' }
		);
		expect(tops.b).toBe(100);
		expect(tops.a).toBe(42);
		expect(tops.c).toBe(300);
	});

	it('pushes a thread down when centering would overflow the top of the page', () => {
		expect(
			stackCommentTops([{ id: 'a', desiredTop: -30, height: 80 }], { minTop: 0, maxBottom: 400 })
		).toEqual({ a: 0 });
	});

	it('pushes a thread up when centering would overflow the bottom of the page', () => {
		expect(
			stackCommentTops([{ id: 'a', desiredTop: 360, height: 80 }], { minTop: 0, maxBottom: 400 })
		).toEqual({ a: 320 });
	});

	it('pulls an overlapping cluster up together to fit the bottom of the page', () => {
		const tops = stackCommentTops(
			[
				{ id: 'a', desiredTop: 340, height: 50 },
				{ id: 'b', desiredTop: 350, height: 50 }
			],
			{ gap: 8, minTop: 0, maxBottom: 400 }
		);
		expect(tops.b).toBe(350);
		expect(tops.a).toBe(292);
		expect(tops.b! + 50).toBe(400);
		expect(tops.a! + 50 + 8).toBe(tops.b);
	});
});
