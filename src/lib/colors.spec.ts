import { describe, expect, it } from 'vitest';
import { DEFAULT_COLORS, nextUniqueColor, normalizeHexColor } from './colors';

describe('normalizeHexColor', () => {
	it('accepts hex with or without a hash', () => {
		expect(normalizeHexColor('#7C9CFF')).toBe('#7c9cff');
		expect(normalizeHexColor('7c9cff')).toBe('#7c9cff');
	});

	it('rejects non-hex values', () => {
		expect(normalizeHexColor('blue')).toBeNull();
		expect(normalizeHexColor('#fff')).toBeNull();
		expect(normalizeHexColor('')).toBeNull();
	});
});

describe('nextUniqueColor', () => {
	it('starts from the designed palette', () => {
		expect(nextUniqueColor([])).toBe(DEFAULT_COLORS[0]);
		expect(nextUniqueColor([DEFAULT_COLORS[0]])).toBe(DEFAULT_COLORS[1]);
	});

	it('leaves the palette when every default is taken', () => {
		const extra = nextUniqueColor(DEFAULT_COLORS);
		expect(DEFAULT_COLORS).not.toContain(extra);
		expect(normalizeHexColor(extra)).toBe(extra);
	});

	it('keeps assigning distinct colors', () => {
		const used = [...DEFAULT_COLORS];
		for (let i = 0; i < 8; i++) {
			const next = nextUniqueColor(used);
			expect(used).not.toContain(next);
			used.push(next);
		}
	});
});
