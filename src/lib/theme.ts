export const THEME_KEY = 'glassine-theme';

export type Theme = 'dark' | 'light';

export function currentTheme(): Theme {
	if (typeof document === 'undefined') return 'dark';
	return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function setTheme(next: Theme) {
	document.documentElement.setAttribute('data-theme', next);
	localStorage.setItem(THEME_KEY, next);
}

export function toggleTheme() {
	setTheme(currentTheme() === 'light' ? 'dark' : 'light');
}
