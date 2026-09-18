export const DEFAULT_COLORS = ['#7c9cff', '#f0a36f', '#7fd0a8', '#e08ec0', '#d4c06a', '#8ec8e0'];

const HEX = /^#?([0-9a-f]{6})$/i;

export function normalizeHexColor(input: string): string | null {
	const match = HEX.exec(input.trim());
	if (!match) return null;
	return `#${match[1].toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
	h = (((h % 360) + 360) % 360) / 360;
	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const toHex = (channel: number) =>
		Math.round(hue2rgb(p, q, channel) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${toHex(h + 1 / 3)}${toHex(h)}${toHex(h - 1 / 3)}`;
}

export function nextUniqueColor(used: (string | null | undefined)[]): string {
	const taken = used
		.map((color) => (color ? normalizeHexColor(color) : null))
		.filter((color): color is string => Boolean(color));
	for (const candidate of DEFAULT_COLORS) {
		if (!taken.includes(candidate)) return candidate;
	}
	const hues = taken.map((hex) => rgbToHsl(...hexToRgb(hex))[0]).sort((a, b) => a - b);
	if (hues.length === 0) return DEFAULT_COLORS[0];
	let bestHue = 0;
	let bestGap = -1;
	for (let i = 0; i < hues.length; i++) {
		const start = hues[i];
		const end = hues[(i + 1) % hues.length] + (i === hues.length - 1 ? 360 : 0);
		const gap = end - start;
		if (gap > bestGap) {
			bestGap = gap;
			bestHue = (start + gap / 2) % 360;
		}
	}
	return hslToHex(bestHue, 0.55, 0.68);
}
