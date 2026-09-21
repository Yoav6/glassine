import type { TagParseRule } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '$lib/md/schema';
import { editorLinks, hrefFromLinkTarget } from './links';

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

	it('ignores clicks that are not on a link', () => {
		expect(hrefFromLinkTarget(null)).toBeNull();
		const state = EditorState.create({ schema, plugins: [editorLinks()] });
		const plugin = state.plugins.find((item) => item.props.handleClick);
		const handleClick = plugin?.props.handleClick;
		expect(handleClick).toBeTypeOf('function');
		const event = {
			target: null,
			metaKey: false,
			ctrlKey: false,
			preventDefault: vi.fn()
		} as unknown as MouseEvent;
		expect(handleClick!.call(plugin!, { editable: true } as never, 0, event)).toBe(false);
		expect(event.preventDefault).not.toHaveBeenCalled();
	});
});
