import { describe, expect, it } from 'vitest';
import {
	allowedViewMode,
	defaultEditorSurface,
	defaultViewMode,
	editorSurfaceLabel,
	isEditorSurface,
	isReadingViewMode,
	isViewMode,
	viewModeLabel
} from './view-mode';

describe('view mode', () => {
	it('defaults authors to editing and reviewers to suggesting', () => {
		expect(defaultViewMode('author')).toBe('editing');
		expect(defaultViewMode('reviewer')).toBe('suggesting');
	});

	it('blocks editing for reviewers', () => {
		expect(allowedViewMode('editing', 'reviewer')).toBe('suggesting');
		expect(allowedViewMode('reading', 'reviewer')).toBe('reading');
		expect(allowedViewMode('reading-modified', 'reviewer')).toBe('reading-modified');
		expect(allowedViewMode('suggesting', 'reviewer')).toBe('suggesting');
	});

	it('lets authors use every mode', () => {
		expect(allowedViewMode('reading', 'author')).toBe('reading');
		expect(allowedViewMode('reading-modified', 'author')).toBe('reading-modified');
		expect(allowedViewMode('suggesting', 'author')).toBe('suggesting');
		expect(allowedViewMode('editing', 'author')).toBe('editing');
	});

	it('labels and guards stored values', () => {
		expect(viewModeLabel('reading')).toBe('Reading');
		expect(viewModeLabel('reading-modified')).toBe('Reading (modified)');
		expect(viewModeLabel('editing')).toBe('Editing');
		expect(isReadingViewMode('reading-modified')).toBe(true);
		expect(isViewMode('reading-modified')).toBe(true);
		expect(isViewMode('editing')).toBe(true);
		expect(isViewMode('admin')).toBe(false);
	});
});

describe('editor surface', () => {
	it('defaults to rich text and labels both surfaces', () => {
		expect(defaultEditorSurface()).toBe('article');
		expect(editorSurfaceLabel('article')).toBe('Rich text');
		expect(editorSurfaceLabel('source')).toBe('Source');
		expect(isEditorSurface('article')).toBe(true);
		expect(isEditorSurface('source')).toBe(true);
		expect(isEditorSurface('wysiwyg')).toBe(false);
	});
});
