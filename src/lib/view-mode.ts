export type ViewMode = 'reading' | 'reading-modified' | 'suggesting' | 'suggesting-clean' | 'editing';

export type EditorSurface = 'article' | 'source';

export const VIEW_MODE_KEY = 'glassine_view_mode';
export const EDITOR_SURFACE_KEY = 'glassine_editor_surface';

export const VIEW_MODES: ViewMode[] = [
	'reading',
	'reading-modified',
	'suggesting',
	'suggesting-clean',
	'editing'
];

export const EDITOR_SURFACES: EditorSurface[] = ['article', 'source'];

export function isViewMode(value: string | null | undefined): value is ViewMode {
	return (
		value === 'reading' ||
		value === 'reading-modified' ||
		value === 'suggesting' ||
		value === 'suggesting-clean' ||
		value === 'editing'
	);
}

/** Both suggesting modes track edits as pending suggestions; only the look differs. */
export function isSuggestingViewMode(mode: ViewMode): boolean {
	return mode === 'suggesting' || mode === 'suggesting-clean';
}

export function isEditorSurface(value: string | null | undefined): value is EditorSurface {
	return value === 'article' || value === 'source';
}

export function isReadingViewMode(mode: ViewMode): boolean {
	return mode === 'reading' || mode === 'reading-modified';
}

export function isAuthorOnlyViewMode(mode: ViewMode): boolean {
	return mode === 'editing';
}

export function viewModeLabel(mode: ViewMode): string {
	if (mode === 'reading') return 'Reading';
	if (mode === 'reading-modified') return 'Reading (modified)';
	if (mode === 'suggesting') return 'Suggesting';
	if (mode === 'suggesting-clean') return 'Suggesting (clean)';
	return 'Editing';
}

export function editorSurfaceLabel(surface: EditorSurface): string {
	return surface === 'source' ? 'Source' : 'Rich text';
}

export function defaultViewMode(role: 'author' | 'reviewer'): ViewMode {
	return role === 'author' ? 'editing' : 'suggesting';
}

export function defaultEditorSurface(): EditorSurface {
	return 'article';
}

export function allowedViewMode(mode: ViewMode, role: 'author' | 'reviewer'): ViewMode {
	if (isAuthorOnlyViewMode(mode) && role !== 'author') return 'suggesting';
	return mode;
}

function storedViewMode(): string | null {
	try {
		return sessionStorage.getItem(VIEW_MODE_KEY);
	} catch {
		return null;
	}
}

function storedEditorSurface(): string | null {
	try {
		return sessionStorage.getItem(EDITOR_SURFACE_KEY);
	} catch {
		return null;
	}
}

export function readEditorSurface(): EditorSurface {
	const stored = storedEditorSurface();
	if (isEditorSurface(stored)) return stored;
	return defaultEditorSurface();
}

export function readViewMode(role: 'author' | 'reviewer'): ViewMode {
	const stored = storedViewMode();
	if (isViewMode(stored)) return allowedViewMode(stored, role);
	return defaultViewMode(role);
}

export function writeViewMode(mode: ViewMode) {
	try {
		sessionStorage.setItem(VIEW_MODE_KEY, mode);
	} catch {
		// ignore
	}
}

export function writeEditorSurface(surface: EditorSurface) {
	try {
		sessionStorage.setItem(EDITOR_SURFACE_KEY, surface);
	} catch {
		// ignore
	}
}
