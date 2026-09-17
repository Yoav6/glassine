import { describe, expect, it } from 'vitest';
import {
	canActOnSuggestion,
	parseSuggestionDomId,
	shouldKeepSuggestionMenu,
	suggestionMenuPosition
} from './suggestions';

describe('parseSuggestionDomId', () => {
	it('reads JSON-stringified ProseMirror data-id values', () => {
		expect(parseSuggestionDomId(JSON.stringify('s1'))).toBe('s1');
		expect(parseSuggestionDomId('"s1"')).toBe('s1');
		expect(parseSuggestionDomId(null)).toBeNull();
	});
});

describe('shouldKeepSuggestionMenu', () => {
	it('stays open on the highlight, the menu, or the caret', () => {
		expect(
			shouldKeepSuggestionMenu({
				menuId: 's1',
				hoveredId: null,
				caretId: null,
				hoveringMenu: false
			})
		).toBe(false);
		expect(
			shouldKeepSuggestionMenu({
				menuId: 's1',
				hoveredId: 's1',
				caretId: null,
				hoveringMenu: false
			})
		).toBe(true);
		expect(
			shouldKeepSuggestionMenu({
				menuId: 's1',
				hoveredId: null,
				caretId: null,
				hoveringMenu: true
			})
		).toBe(true);
		expect(
			shouldKeepSuggestionMenu({
				menuId: 's1',
				hoveredId: null,
				caretId: 's1',
				hoveringMenu: false
			})
		).toBe(true);
	});
});

describe('canActOnSuggestion', () => {
	it('lets authors accept only while editing, and reviewers reject their own', () => {
		expect(
			canActOnSuggestion({ role: 'author', userId: 'a', authorId: 'r', viewMode: 'editing' })
		).toEqual({
			accept: true,
			reject: true,
			comment: true
		});
		expect(
			canActOnSuggestion({ role: 'author', userId: 'a', authorId: 'r', viewMode: 'suggesting' })
		).toEqual({
			accept: false,
			reject: true,
			comment: true
		});
		expect(
			canActOnSuggestion({ role: 'reviewer', userId: 'r', authorId: 'r', viewMode: 'suggesting' })
		).toEqual({
			accept: false,
			reject: true,
			comment: true
		});
		expect(
			canActOnSuggestion({ role: 'reviewer', userId: 'r', authorId: 'other', viewMode: 'suggesting' })
		).toEqual({
			accept: false,
			reject: false,
			comment: true
		});
	});
});

describe('suggestionMenuPosition', () => {
	it('sits above the highlight when there is room', () => {
		const pos = suggestionMenuPosition({ left: 40, top: 80, right: 120, bottom: 100 }, { width: 72, height: 32 });
		expect(pos.above).toBe(true);
		expect(pos.top).toBe(42);
		expect(pos.left).toBe(40);
	});
});
