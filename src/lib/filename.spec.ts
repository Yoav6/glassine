import { describe, expect, it } from 'vitest';
import {
	downloadAssetFileName,
	downloadFileName,
	preservedAssetFileName,
	preservedMarkdownFileName,
	relativeAssetPath
} from './filename';

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

describe('preservedAssetFileName', () => {
	it('keeps image basenames', () => {
		expect(preservedAssetFileName('Pasted-image.png')).toBe('Pasted-image.png');
		expect(preservedAssetFileName('Attachments/a.png')).toBe('a.png');
	});

	it('rejects markdown basenames', () => {
		expect(preservedAssetFileName('note.md')).toBe('asset.bin');
	});
});

describe('relativeAssetPath', () => {
	it('keeps nested vault paths', () => {
		expect(relativeAssetPath('Attachments/a.png')).toBe('Attachments/a.png');
	});
});

describe('downloadAssetFileName', () => {
	it('is the hosted asset basename', () => {
		expect(downloadAssetFileName('folder/pic.png')).toBe('pic.png');
	});
});
