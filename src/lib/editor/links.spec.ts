import type { TagParseRule } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { schema } from '$lib/md/schema';
import { linkHrefAtPos } from './links';

describe('editor links', () => {
	it('parses both real anchors and in-editor link spans', () => {
		const tags = schema.marks.link?.spec.parseDOM?.map((rule) => rule.tag);
		expect(tags).toContain('a[href]');
		expect(tags).toContain('span[data-link-href]');
	});

	it('reads href and title from in-editor link spans', () => {
		const rule = schema.marks.link?.spec.parseDOM?.find(
			(item) => item.tag === 'span[data-link-href]'
		) as TagParseRule | undefined;
		expect(rule?.getAttrs).toBeTypeOf('function');
		expect(
			rule!.getAttrs!({
				getAttribute(name: string) {
					if (name === 'data-link-href') return 'https://example.com/docs';
					if (name === 'title') return 'Docs';
					return null;
				}
			} as HTMLElement)
		).toEqual({ href: 'https://example.com/docs', title: 'Docs' });
	});

	it('finds the href of the link mark at a caret position', () => {
		const linkMark = schema.marks.link!.create({ href: 'https://example.com', title: null });
		const doc = schema.node('doc', null, [
			schema.node('paragraph', null, [
				schema.text('before '),
				schema.text('linked', [linkMark]),
				schema.text(' after')
			])
		]);
		// "before " spans 1-8, "linked" spans 8-14, " after" spans 14-20
		expect(linkHrefAtPos(doc, 10)).toBe('https://example.com');
		expect(linkHrefAtPos(doc, 3)).toBeNull();
		expect(linkHrefAtPos(doc, 18)).toBeNull();
	});
});
