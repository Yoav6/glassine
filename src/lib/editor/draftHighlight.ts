import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export type DraftRange = { from: number; to: number };

export const draftHighlightKey = new PluginKey<DraftRange | null>('glassine-draft-highlight');

/**
 * Keeps the passage being commented on visibly highlighted after focus moves to the
 * comment box, where the browser would otherwise drop its own selection highlight.
 */
export function draftHighlight(): Plugin<DraftRange | null> {
	return new Plugin<DraftRange | null>({
		key: draftHighlightKey,
		state: {
			init: () => null,
			apply(tr, prev) {
				const next = tr.getMeta(draftHighlightKey) as DraftRange | null | undefined;
				if (next !== undefined) return next;
				if (!prev || !tr.docChanged) return prev;
				const from = tr.mapping.map(prev.from, 1);
				const to = tr.mapping.map(prev.to, -1);
				return from < to ? { from, to } : null;
			}
		},
		props: {
			decorations(state) {
				const range = draftHighlightKey.getState(state);
				if (!range || range.from >= range.to) return null;
				return DecorationSet.create(state.doc, [
					Decoration.inline(range.from, range.to, { class: 'comment-draft-hl' })
				]);
			}
		}
	});
}
