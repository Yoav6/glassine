export const THEME_KEY = 'glassine-theme';
export const CHROME_POSITION_KEY = 'glassine-chrome-position';

export type Theme = 'dark' | 'light';
export type ChromePosition = 'top' | 'bottom';

export function currentTheme(): Theme {
	if (typeof document === 'undefined') return 'dark';
	return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function setTheme(next: Theme) {
	document.documentElement.setAttribute('data-theme', next);
	localStorage.setItem(THEME_KEY, next);
}

export function isChromePosition(value: string | null | undefined): value is ChromePosition {
	return value === 'top' || value === 'bottom';
}

export function currentChromePosition(): ChromePosition {
	if (typeof document === 'undefined') return 'top';
	return document.documentElement.getAttribute('data-chrome-position') === 'bottom' ? 'bottom' : 'top';
}

export function setChromePosition(next: ChromePosition) {
	document.documentElement.setAttribute('data-chrome-position', next);
	localStorage.setItem(CHROME_POSITION_KEY, next);
}
