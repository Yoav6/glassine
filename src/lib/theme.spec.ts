import { describe, expect, it } from 'vitest';
import { isChromePosition } from './theme';

describe('chrome position', () => {
	it('accepts top and bottom only', () => {
		expect(isChromePosition('top')).toBe(true);
		expect(isChromePosition('bottom')).toBe(true);
		expect(isChromePosition('left')).toBe(false);
		expect(isChromePosition(null)).toBe(false);
	});
});
