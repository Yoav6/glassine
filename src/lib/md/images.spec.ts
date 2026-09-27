import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parse';
import {
	assetSrcFromRoutePath,
	documentAssetUrl,
	extractLocalAssetRefs,
	extractWikiImageEmbeds,
	imageContentType,
	isExternalImageSrc,
	relativeAssetSrc,
	resolveAssetRelativePath,
	rewriteMarkdownAssetRefs
} from './images';

function imagesIn(source: string): { src: string; alt: string; local: boolean }[] {
	const { doc } = parseMarkdown(source);
	const images: { src: string; alt: string; local: boolean }[] = [];
	doc.descendants((node) => {
		if (node.type.name === 'image') {
			images.push({
				src: node.attrs.src as string,
				alt: node.attrs.alt as string,
				local: node.attrs.local as boolean
			});
		}
	});
	return images;
}

describe('parseMarkdown images', () => {
	it('creates a non-local image node from markdown image syntax', () => {
		expect(imagesIn('Hello\n\n![](Pasted-image-20260919175947.png)\n')).toEqual([
			{ src: 'Pasted-image-20260919175947.png', alt: '', local: false }
		]);
	});

	it("creates a local image node from Obsidian's wiki-embed syntax", () => {
		expect(imagesIn('Hello\n\n![[Pasted image.png]]\n')).toEqual([
			{ src: 'Pasted image.png', alt: '', local: true }
		]);
	});

	it('carries the alias through as alt text and strips a #heading suffix', () => {
		expect(imagesIn('![[folder/pic.png#section|My caption]]')).toEqual([
			{ src: 'folder/pic.png', alt: 'My caption', local: true }
		]);
	});

	it('splits a wiki embed out of surrounding text, including inside emphasis', () => {
		const { doc } = parseMarkdown('*before ![[pic.png]] after*');
		const kinds = doc.firstChild!.content.content.map((n) => n.type.name);
		expect(kinds).toEqual(['text', 'image', 'text']);
	});

	it('leaves a non-image wiki embed (e.g. a note transclusion) as plain text', () => {
		expect(imagesIn('![[Some Other Note]]')).toEqual([]);
	});

	it('renders plain markdown and wiki-embed images side by side, only the latter marked local', () => {
		expect(imagesIn('![[a.png]] and ![b](b.png)')).toEqual([
			{ src: 'a.png', alt: '', local: true },
			{ src: 'b.png', alt: 'b', local: false }
		]);
	});
});

describe('resolveAssetRelativePath', () => {
	it('resolves siblings of a root document', () => {
		expect(resolveAssetRelativePath('hello.md', 'Pasted-image.png')).toBe('Pasted-image.png');
	});

	it('resolves siblings of a nested document', () => {
		expect(resolveAssetRelativePath('notes/hello.md', 'img.png')).toBe('notes/img.png');
	});

	it('treats a leading slash as vault root', () => {
		expect(resolveAssetRelativePath('notes/hello.md', '/Attachments/a.png')).toBe(
			'Attachments/a.png'
		);
	});

	it('rejects paths that escape the vault', () => {
		expect(resolveAssetRelativePath('hello.md', '../secret.png')).toBeNull();
		expect(resolveAssetRelativePath('notes/a.md', '../../x.png')).toBeNull();
	});

	it('ignores external URLs', () => {
		expect(resolveAssetRelativePath('hello.md', 'https://example.com/a.png')).toBeNull();
		expect(isExternalImageSrc('data:image/png;base64,xx')).toBe(true);
	});
});

describe('documentAssetUrl', () => {
	it('rewrites a local image onto the document asset API, vault-root-relative', () => {
		expect(documentAssetUrl('hello', 'Pasted-image.png', true)).toBe(
			'/api/documents/hello/assets/__root__/Pasted-image.png'
		);
	});

	it('encodes spaces, and normalizes a redundant leading slash the same way', () => {
		expect(documentAssetUrl('hello', 'my image.png', true)).toBe(
			'/api/documents/hello/assets/__root__/my%20image.png'
		);
		expect(documentAssetUrl('hello', '/Attachments/a.png', true)).toBe(
			'/api/documents/hello/assets/__root__/Attachments/a.png'
		);
		expect(assetSrcFromRoutePath(['__root__', 'Attachments', 'a.png'])).toBe('/Attachments/a.png');
	});

	it('leaves a non-local src exactly as given — Glassine no longer resolves ![]() against the vault', () => {
		expect(documentAssetUrl('hello', 'https://cdn.example/x.png', false)).toBe(
			'https://cdn.example/x.png'
		);
		expect(documentAssetUrl('hello', 'Pasted-image.png', false)).toBe('Pasted-image.png');
	});
});

describe('imageContentType', () => {
	it('maps common image extensions', () => {
		expect(imageContentType('a.PNG')).toBe('image/png');
		expect(imageContentType('a.jpeg')).toBe('image/jpeg');
		expect(imageContentType('note.md')).toBeNull();
	});
});

describe('relativeAssetSrc', () => {
	it('stays flat for root documents', () => {
		expect(relativeAssetSrc('hello.md', 'pic.png')).toBe('pic.png');
	});

	it('uses .. when the asset is outside the document folder', () => {
		expect(relativeAssetSrc('notes/hello.md', 'pic.png')).toBe('../pic.png');
	});
});

describe('extractWikiImageEmbeds', () => {
	it('finds wiki-embed images and skips non-image wiki links', () => {
		expect(extractWikiImageEmbeds('![[a.png]] and ![[Some Note]] and ![[b.png|Alt]]')).toEqual([
			{ raw: '![[a.png]]', index: 0, linkpath: 'a.png', alias: null },
			{ raw: '![[b.png|Alt]]', index: 34, linkpath: 'b.png', alias: 'Alt' }
		]);
	});
});

describe('extractLocalAssetRefs', () => {
	it('collects link destinations but not markdown image destinations', () => {
		expect(
			extractLocalAssetRefs(
				'See ![](a.png) and [doc](b.pdf) and ![x](https://x.test/y.png)',
				'hello.md'
			)
		).toEqual(['b.pdf']);
	});

	it('collects a wiki-embed image, resolved vault-root-relative regardless of document folder', () => {
		expect(extractLocalAssetRefs('![[attachments/pic.png]]', 'notes/nested/doc.md')).toEqual([
			'attachments/pic.png'
		]);
	});
});

describe('rewriteMarkdownAssetRefs', () => {
	it('rewrites a matching link src and preserves its root-vs-relative style', () => {
		expect(
			rewriteMarkdownAssetRefs('Hi [see](old.png) there', 'hello.md', 'old.png', 'new.png')
		).toBe('Hi [see](new.png) there');
		expect(
			rewriteMarkdownAssetRefs('Hi [see](/old.png) there', 'notes/a.md', 'old.png', 'new.png')
		).toBe('Hi [see](/new.png) there');
	});

	it('leaves a matching markdown *image* untouched — it was never tracked as local to begin with', () => {
		expect(
			rewriteMarkdownAssetRefs('Hi ![](old.png) there', 'hello.md', 'old.png', 'new.png')
		).toBe('Hi ![](old.png) there');
	});

	it('leaves unrelated refs alone', () => {
		expect(rewriteMarkdownAssetRefs('[keep](keep.png)', 'hello.md', 'old.png', 'new.png')).toBe(
			'[keep](keep.png)'
		);
	});

	it('rewrites a matching wiki embed in place, preserving its alias and syntax', () => {
		expect(
			rewriteMarkdownAssetRefs(
				'![[attachments/old.png|Alt Text]]',
				'notes/a.md',
				'attachments/old.png',
				'attachments/new.png'
			)
		).toBe('![[attachments/new.png|Alt Text]]');
	});

	it('leaves an unrelated wiki embed alone', () => {
		expect(
			rewriteMarkdownAssetRefs('![[keep.png]]', 'hello.md', 'old.png', 'new.png')
		).toBe('![[keep.png]]');
	});
});
