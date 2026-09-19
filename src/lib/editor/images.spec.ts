import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Decoration } from 'prosemirror-view';
import { buildSelector } from '$lib/anchor';
import { parseMarkdown } from '$lib/md';
import { schema } from '$lib/md/schema';
import { commentDecorations, liveCommentRanges } from './comments';
import { hydrateAnnotations } from './hydrate';
import { applyImageCommentDecorations } from './images';
import { sourceRangeForDocSelection } from './selectionRange';

function mockImageWrap() {
	const classes = new Set<string>(['pm-image']);
	const style = new Map<string, string>();
	const dataset: Record<string, string> = {};
	return {
		classList: {
			add: (...names: string[]) => names.forEach((n) => classes.add(n)),
			remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
			contains: (name: string) => classes.has(name)
		},
		dataset,
		style: {
			setProperty: (key: string, value: string) => style.set(key, value),
			removeProperty: (key: string) => style.delete(key),
			getPropertyValue: (key: string) => style.get(key) ?? ''
		},
		removeAttribute: (name: string) => {
			if (name === 'data-comment-id') delete dataset.commentId;
			if (name === 'data-comment-ids') delete dataset.commentIds;
		}
	};
}

describe('sourceRangeForDocSelection', () => {
	it('covers the full markdown span for an image atom', () => {
		const source = 'Hi\n\n![](Pasted-image.png)\n\nBye\n';
		const parsed = parseMarkdown(source);
		let imagePos = -1;
		parsed.doc.descendants((node, pos) => {
			if (node.type.name === 'image') imagePos = pos;
		});
		expect(imagePos).toBeGreaterThanOrEqual(0);
		const range = sourceRangeForDocSelection(parsed.map, imagePos, imagePos + 1);
		expect(range).toEqual({
			start: source.indexOf('![](Pasted-image.png)'),
			end: source.indexOf('![](Pasted-image.png)') + '![](Pasted-image.png)'.length
		});
	});

	it('maps the position after an image to the source after the image markup', () => {
		const source = 'Hi\n\n![](pic.png)\n\nBye\n';
		const parsed = parseMarkdown(source);
		let imagePos = -1;
		parsed.doc.descendants((node, pos) => {
			if (node.type.name === 'image') imagePos = pos;
		});
		const after = parsed.map.docToSrc(imagePos + 1);
		expect(after?.offset).toBe(source.indexOf('![](pic.png)') + '![](pic.png)'.length);
	});

	it('still maps ordinary text selections', () => {
		const source = 'hello world\n';
		const parsed = parseMarkdown(source);
		const at = source.indexOf('world');
		const from = parsed.map.srcToDoc(at)!.pos;
		const range = sourceRangeForDocSelection(parsed.map, from, from + 5);
		expect(range).toEqual({ start: at, end: at + 5 });
		expect(source.slice(range!.start, range!.end)).toBe('world');
	});
});

describe('image comment decorations', () => {
	it('marks the image wrapper like a text highlight', () => {
		const el = mockImageWrap();
		const deco = Decoration.inline(
			1,
			2,
			{ class: 'comment-hl' },
			{ id: 'c1', color: '#7c9cff', emphasized: true }
		);
		applyImageCommentDecorations(el as unknown as HTMLElement, [deco]);
		expect(el.classList.contains('comment-hl')).toBe(true);
		expect(el.classList.contains('is-emphasized')).toBe(true);
		expect(el.dataset.commentId).toBe('c1');
		expect(el.style.getPropertyValue('--comment-color')).toBe('#7c9cff');
	});

	it('hydrates a comment on an image to a non-empty doc range', () => {
		const source = 'Hi\n\n![](pic.png)\n';
		const parsed = parseMarkdown(source);
		const exact = '![](pic.png)';
		const start = source.indexOf(exact);
		expect(parsed.map.srcRangeToDoc(start, start + exact.length)).toMatchObject({
			from: expect.any(Number),
			to: expect.any(Number)
		});
		const mapped = parsed.map.srcRangeToDoc(start, start + exact.length)!;
		expect(mapped.to).toBeGreaterThan(mapped.from);

		const selector = buildSelector(source, start, start + exact.length, {
			path: '',
			paraOrdinal: 1
		});
		const hydrated = hydrateAnnotations(EditorState.create({ schema, doc: parsed.doc }), parsed, [
			{
				id: 'c1',
				type: 'comment',
				status: 'open',
				authorId: 'alice',
				highlightColor: '#7c9cff',
				replacement: null,
				body: 'nice pic',
				parentId: null,
				...selector
			}
		]);
		expect(hydrated.commentRanges).toHaveLength(1);
		expect(hydrated.commentRanges[0]!.to).toBeGreaterThan(hydrated.commentRanges[0]!.from);

		const state = EditorState.create({
			schema,
			doc: parsed.doc,
			plugins: [commentDecorations(hydrated.commentRanges)]
		});
		expect(liveCommentRanges(state)[0]).toMatchObject({ id: 'c1' });
	});
});
