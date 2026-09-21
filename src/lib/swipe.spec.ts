import { describe, expect, it } from 'vitest';
import { classifySwipe, type SwipeContext } from './swipe';

const closed: SwipeContext = {
	width: 400,
	tocOpen: false,
	commentsOpen: false,
	canOpenToc: true,
	canOpenComments: true
};

describe('classifySwipe', () => {
	it('opens the contents from a right swipe that starts at the left edge', () => {
		expect(classifySwipe({ x: 8, y: 300 }, { x: 140, y: 310 }, closed)).toBe('open-toc');
	});

	it('opens the comments from a left swipe that starts at the right edge', () => {
		expect(classifySwipe({ x: 392, y: 300 }, { x: 250, y: 296 }, closed)).toBe('open-comments');
	});

	it('ignores swipes that do not start at an edge', () => {
		expect(classifySwipe({ x: 120, y: 300 }, { x: 260, y: 300 }, closed)).toBeNull();
		expect(classifySwipe({ x: 280, y: 300 }, { x: 140, y: 300 }, closed)).toBeNull();
	});

	it('ignores edge swipes in the wrong direction', () => {
		expect(classifySwipe({ x: 8, y: 300 }, { x: 8, y: 300 }, closed)).toBeNull();
		expect(classifySwipe({ x: 392, y: 300 }, { x: 392, y: 300 }, closed)).toBeNull();
	});

	it('ignores short travel', () => {
		expect(classifySwipe({ x: 8, y: 300 }, { x: 40, y: 300 }, closed)).toBeNull();
	});

	it('ignores mostly vertical travel so scrolling near an edge is safe', () => {
		expect(classifySwipe({ x: 8, y: 300 }, { x: 80, y: 420 }, closed)).toBeNull();
	});

	it('does not open a drawer that has nothing to show', () => {
		expect(classifySwipe({ x: 8, y: 300 }, { x: 140, y: 300 }, { ...closed, canOpenToc: false })).toBeNull();
		expect(
			classifySwipe({ x: 392, y: 300 }, { x: 250, y: 300 }, { ...closed, canOpenComments: false })
		).toBeNull();
	});

	it('closes the contents with a left swipe from anywhere', () => {
		const ctx = { ...closed, tocOpen: true };
		expect(classifySwipe({ x: 200, y: 300 }, { x: 60, y: 300 }, ctx)).toBe('close-toc');
		expect(classifySwipe({ x: 100, y: 300 }, { x: 240, y: 300 }, ctx)).toBeNull();
	});

	it('closes the comments with a right swipe from anywhere', () => {
		const ctx = { ...closed, commentsOpen: true };
		expect(classifySwipe({ x: 150, y: 300 }, { x: 290, y: 300 }, ctx)).toBe('close-comments');
		expect(classifySwipe({ x: 300, y: 300 }, { x: 160, y: 300 }, ctx)).toBeNull();
	});

	it('does not open the other drawer while one is open', () => {
		expect(classifySwipe({ x: 8, y: 300 }, { x: 140, y: 300 }, { ...closed, tocOpen: true })).toBeNull();
		expect(
			classifySwipe({ x: 392, y: 300 }, { x: 250, y: 300 }, { ...closed, commentsOpen: true })
		).toBeNull();
	});
});
