export type ViewMode =
	| 'reading'
	| 'reading-modified'
	| 'suggesting'
	| 'editing'
	| 'editing-source';

export const VIEW_MODE_KEY = 'glassine_view_mode';

export const VIEW_MODES: ViewMode[] = [
	'reading',
	'reading-modified',
	'suggesting',
	'editing',
	'editing-source'
];

export function isViewMode(value: string | null | undefined): value is ViewMode {
	return (
		value === 'reading' ||
		value === 'reading-modified' ||
		value === 'suggesting' ||
		value === 'editing' ||
		value === 'editing-source'
	);
}

export function isReadingViewMode(mode: ViewMode): boolean {
	return mode === 'reading' || mode === 'reading-modified';
}

export function isSourceViewMode(mode: ViewMode): boolean {
	return mode === 'editing-source';
}

export function isAuthorOnlyViewMode(mode: ViewMode): boolean {
	return mode === 'editing' || mode === 'editing-source';
}

export function viewModeLabel(mode: ViewMode): string {
	if (mode === 'reading') return 'Reading';
	if (mode === 'reading-modified') return 'Reading (modified)';
	if (mode === 'suggesting') return 'Suggesting';
	if (mode === 'editing-source') return 'Editing (source)';
	return 'Editing';
}

export function defaultViewMode(role: 'author' | 'reviewer'): ViewMode {
	return role === 'author' ? 'editing' : 'suggesting';
}

export function allowedViewMode(mode: ViewMode, role: 'author' | 'reviewer'): ViewMode {
	if (isAuthorOnlyViewMode(mode) && role !== 'author') return 'suggesting';
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
