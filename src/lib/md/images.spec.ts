import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parse';
import {
	assetSrcFromRoutePath,
	documentAssetUrl,
	extractLocalAssetRefs,
	imageContentType,
	isExternalImageSrc,
	relativeAssetSrc,
	resolveAssetRelativePath,
	rewriteMarkdownAssetRefs
} from './images';

describe('parseMarkdown images', () => {
	it('creates an image node from markdown image syntax', () => {
		const { doc } = parseMarkdown('Hello\n\n![](Pasted-image-20260919175947.png)\n');
		const images: { src: string; alt: string }[] = [];
		doc.descendants((node) => {
			if (node.type.name === 'image') {
				images.push({ src: node.attrs.src as string, alt: node.attrs.alt as string });
			}
		});
		expect(images).toEqual([{ src: 'Pasted-image-20260919175947.png', alt: '' }]);
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
	it('rewrites relative paths onto the document asset API', () => {
		expect(documentAssetUrl('hello', 'Pasted-image.png')).toBe(
			'/api/documents/hello/assets/Pasted-image.png'
		);
	});

	it('encodes spaces and vault-root paths', () => {
		expect(documentAssetUrl('hello', 'my image.png')).toBe(
			'/api/documents/hello/assets/my%20image.png'
		);
		expect(documentAssetUrl('hello', '/Attachments/a.png')).toBe(
			'/api/documents/hello/assets/__root__/Attachments/a.png'
		);
		expect(assetSrcFromRoutePath(['__root__', 'Attachments', 'a.png'])).toBe('/Attachments/a.png');
	});

	it('leaves remote URLs alone', () => {
		expect(documentAssetUrl('hello', 'https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
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

describe('extractLocalAssetRefs', () => {
	it('collects image and link destinations', () => {
		expect(
			extractLocalAssetRefs(
				'See ![](a.png) and [doc](b.pdf) and ![x](https://x.test/y.png)',
				'hello.md'
			)
		).toEqual(['a.png', 'b.pdf']);
	});
});

describe('rewriteMarkdownAssetRefs', () => {
	it('rewrites matching image srcs and preserves style', () => {
		expect(
			rewriteMarkdownAssetRefs('Hi ![](old.png) there', 'hello.md', 'old.png', 'new.png')
		).toBe('Hi ![](new.png) there');
		expect(
			rewriteMarkdownAssetRefs('Hi ![](/old.png) there', 'notes/a.md', 'old.png', 'new.png')
		).toBe('Hi ![](/new.png) there');
	});

	it('leaves unrelated refs alone', () => {
		expect(rewriteMarkdownAssetRefs('![](keep.png)', 'hello.md', 'old.png', 'new.png')).toBe(
			'![](keep.png)'
		);
	});
});
