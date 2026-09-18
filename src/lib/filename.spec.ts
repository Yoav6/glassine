import { describe, expect, it } from 'vitest';
import { downloadFileName, preservedMarkdownFileName } from './filename';

describe('preservedMarkdownFileName', () => {
	it('keeps spaces, commas, and original casing', () => {
		expect(
			preservedMarkdownFileName(
				'Georgism Requires Sortition, Sortitionists Should Focus on Taxation.md'
			)
		).toBe('Georgism Requires Sortition, Sortitionists Should Focus on Taxation.md');
	});

	it('uses only the basename of a path', () => {
		expect(preservedMarkdownFileName('../../etc/passwd.md')).toBe('passwd.md');
		expect(preservedMarkdownFileName('C:\\Vault\\Note.md')).toBe('Note.md');
	});

	it('falls back when the name is empty', () => {
		expect(preservedMarkdownFileName('.md')).toBe('document.md');
		expect(preservedMarkdownFileName('..')).toBe('document.md');
	});
});

describe('downloadFileName', () => {
	it('is the hosted file basename', () => {
		expect(downloadFileName('folder/My Note.md')).toBe('My Note.md');
	});
});
