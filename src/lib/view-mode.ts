export type ViewMode = 'reading' | 'reading-modified' | 'suggesting' | 'editing';

export const VIEW_MODE_KEY = 'glassine_view_mode';

export const VIEW_MODES: ViewMode[] = ['reading', 'reading-modified', 'suggesting', 'editing'];

export function isViewMode(value: string | null | undefined): value is ViewMode {
	return (
		value === 'reading' ||
		value === 'reading-modified' ||
		value === 'suggesting' ||
		value === 'editing'
	);
}

export function isReadingViewMode(mode: ViewMode): boolean {
	return mode === 'reading' || mode === 'reading-modified';
}

export function viewModeLabel(mode: ViewMode): string {
	if (mode === 'reading') return 'Reading';
	if (mode === 'reading-modified') return 'Reading (modified)';
	if (mode === 'suggesting') return 'Suggesting';
	return 'Editing';
}

export function defaultViewMode(role: 'author' | 'reviewer'): ViewMode {
	return role === 'author' ? 'editing' : 'suggesting';
}

export function allowedViewMode(mode: ViewMode, role: 'author' | 'reviewer'): ViewMode {
	if (mode === 'editing' && role !== 'author') return 'suggesting';
	return mode;
}

export function readViewMode(role: 'author' | 'reviewer'): ViewMode {
	try {
		const stored = sessionStorage.getItem(VIEW_MODE_KEY);
		if (isViewMode(stored)) return allowedViewMode(stored, role);
	} catch {
		// Private mode can throw; fall through to the role default.
	}
	return defaultViewMode(role);
}

export function writeViewMode(mode: ViewMode) {
	try {
		sessionStorage.setItem(VIEW_MODE_KEY, mode);
	} catch {
		// ignore
	}
}
