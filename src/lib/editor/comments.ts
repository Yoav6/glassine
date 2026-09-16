import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { CommentRange } from './hydrate';

export const commentDecorationsKey = new PluginKey<DecorationSet>('glassine-comments');

export function commentDecorations(ranges: CommentRange[]): Plugin {
	return new Plugin({
		key: commentDecorationsKey,
		state: {
			init: (_, state) => DecorationSet.create(state.doc, toDecos(ranges)),
			apply(tr, set) {
				const next = tr.getMeta(commentDecorationsKey) as CommentRange[] | undefined;
				if (next) return DecorationSet.create(tr.doc, toDecos(next));
				return set.map(tr.mapping, tr.doc);
			}
		},
		props: {
			decorations(state) {
				return commentDecorationsKey.getState(state);
			}
		}
	});
}

function toDecos(ranges: CommentRange[]): Decoration[] {
	return ranges.map((range) =>
		Decoration.inline(range.from, range.to, {
			class: 'comment-hl',
			style: range.color ? `--comment-color:${range.color}` : undefined,
			'data-comment-id': range.id
		})
	);
}
