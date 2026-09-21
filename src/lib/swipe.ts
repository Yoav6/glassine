/**
 * Must match the `@media (max-width: 48rem)` blocks in app.css: that is where the
 * table of contents and the comment gutter turn into slide-in drawers.
 */
export const MOBILE_MEDIA_QUERY = 'max-width: 48rem';

/** A drawer swipe has to begin this close to the screen edge. */
export const EDGE_ZONE_PX = 32;
/** Minimum horizontal travel before a touch counts as a swipe. */
export const SWIPE_MIN_DISTANCE_PX = 56;
/** How much more horizontal than vertical the travel must be, so scrolling never opens a drawer. */
export const SWIPE_DOMINANCE = 1.5;

export type SwipeAction = 'open-toc' | 'open-comments' | 'close-toc' | 'close-comments' | null;

export type SwipeContext = {
	width: number;
	tocOpen: boolean;
	commentsOpen: boolean;
	canOpenToc: boolean;
	canOpenComments: boolean;
};

export function classifySwipe(
	start: { x: number; y: number },
	end: { x: number; y: number },
	ctx: SwipeContext
): SwipeAction {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return null;
	if (Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE) return null;
	// A drawer closes by being swiped back toward the edge it came from.
	if (ctx.tocOpen) return dx < 0 ? 'close-toc' : null;
	if (ctx.commentsOpen) return dx > 0 ? 'close-comments' : null;
	if (dx > 0 && start.x <= EDGE_ZONE_PX && ctx.canOpenToc) return 'open-toc';
	if (dx < 0 && start.x >= ctx.width - EDGE_ZONE_PX && ctx.canOpenComments) return 'open-comments';
	return null;
}
