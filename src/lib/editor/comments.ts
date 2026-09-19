import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { CommentResolveStep } from './commentStep';
import type { CommentRange } from './hydrate';

export type CommentPluginState = {
	emphasized: Set<string>;
	hidden: Set<string>;
	decorations: DecorationSet;
};

export const commentDecorationsKey = new PluginKey<CommentPluginState>('glassine-comments');
export const commentEmphasisKey = new PluginKey<string[]>('glassine-comment-emphasis');

export function commentDecorations(ranges: CommentRange[]): Plugin {
	return new Plugin({
		key: commentDecorationsKey,
		state: {
			init: (_, state) => ({
				emphasized: new Set<string>(),
				hidden: new Set<string>(),
				decorations: DecorationSet.create(state.doc, toDecos(ranges, new Set(), state.doc))
			}),
			apply(tr, prev) {
				const nextRanges = tr.getMeta(commentDecorationsKey) as CommentRange[] | undefined;
				const emphasizedList = tr.getMeta(commentEmphasisKey) as string[] | undefined;
				const emphasized = emphasizedList ? new Set(emphasizedList) : prev.emphasized;
				let decorations = nextRanges
					? DecorationSet.create(tr.doc, toDecos(nextRanges, emphasized, tr.doc))
					: prev.decorations.map(tr.mapping, tr.doc);
				if (!nextRanges && emphasizedList) {
					decorations = DecorationSet.create(
						tr.doc,
						toDecos(fromDecos(decorations), emphasized, tr.doc)
					);
				}
				const hidden = new Set(prev.hidden);
				for (const step of tr.steps) {
					if (!(step instanceof CommentResolveStep)) continue;
					if (step.hide) {
						hidden.add(step.threadId);
						decorations = removeDecoById(decorations, step.threadId);
					} else {
						hidden.delete(step.threadId);
						if (step.range && step.range.from < step.range.to) {
							decorations = decorations.add(
								tr.doc,
								toDecos([step.range], emphasized, tr.doc)
							);
						}
					}
				}
				return { emphasized, hidden, decorations };
			}
		},
		props: {
			decorations(state) {
				return commentDecorationsKey.getState(state)?.decorations ?? null;
			}
		}
	});
}

export function liveCommentRanges(state: EditorState): CommentRange[] {
	const pluginState = commentDecorationsKey.getState(state);
	const decorations = pluginState?.decorations;
	if (!decorations) return [];
	return fromDecos(decorations);
}

export function commentIdsAt(state: EditorState, from: number, to = from): string[] {
	const pluginState = commentDecorationsKey.getState(state);
	if (!pluginState?.decorations) return [];
	const start = Math.min(from, to);
	const end = Math.max(from, to);
	return pluginState.decorations
		.find(start, end)
		.map((deco) => deco.spec.id as string)
		.filter(Boolean);
}

export function commentIdsAtSelection(state: EditorState): string[] {
	const { from, to } = state.selection;
	return commentIdsAt(state, from, to);
}

export function sameIdList(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const other = new Set(b);
	return a.every((id) => other.has(id));
}

export function sameCommentRanges(
	a: { id: string; from: number; to: number }[],
	b: { id: string; from: number; to: number }[]
): boolean {
	if (a.length !== b.length) return false;
	return a.every((range, i) => {
		const other = b[i];
		return other != null && range.id === other.id && range.from === other.from && range.to === other.to;
	});
}

export function commentIdsFromTarget(target: EventTarget | null): string[] {
	if (!(target instanceof Element)) return [];
	const ids: string[] = [];
	let el: Element | null = target;
	while (el) {
		const multi = el.getAttribute('data-comment-ids');
		if (
			multi &&
			(el.classList.contains('comment-hl') || el.classList.contains('comment-card'))
		) {
			for (const id of multi.split(/\s+/)) {
				if (id && !ids.includes(id)) ids.push(id);
			}
		}
		const id = el.getAttribute('data-comment-id');
		if (
			id &&
			(el.classList.contains('comment-hl') || el.classList.contains('comment-card')) &&
			!ids.includes(id)
		) {
			ids.push(id);
		}
		el = el.parentElement;
	}
	return ids;
}

export function isThreadHidden(state: EditorState, id: string): boolean {
	return Boolean(commentDecorationsKey.getState(state)?.hidden.has(id));
}

export function hideThreadsOn(tr: Transaction, state: EditorState, ids: string[]): Transaction {
	if (!ids.length) return tr;
	const ranges = liveCommentRanges(state);
	let next = tr;
	for (const id of ids) {
		const range = ranges.find((item) => item.id === id) ?? null;
		next = next.step(new CommentResolveStep(id, range, true));
	}
	return next;
}

export function applyCommentEmphasis(tr: Transaction, ids: string[]): Transaction {
	return tr.setMeta(commentEmphasisKey, ids).setMeta('addToHistory', false);
}

export function applyCommentRanges(tr: Transaction, ranges: CommentRange[]): Transaction {
	return tr.setMeta(commentDecorationsKey, ranges).setMeta('addToHistory', false);
}

function removeDecoById(set: DecorationSet, id: string): DecorationSet {
	const gone = set.find().filter((deco) => deco.spec.id === id);
	return gone.length ? set.remove(gone) : set;
}

function fromDecos(set: DecorationSet): CommentRange[] {
	const seen = new Set<string>();
	const ranges: CommentRange[] = [];
	for (const deco of set.find()) {
		const id = deco.spec.id as string;
		if (!id || seen.has(id) || deco.spec.image) continue;
		seen.add(id);
		ranges.push({
			id,
			from: deco.from,
			to: deco.to,
			color: (deco.spec.color as string | null) ?? null,
			authorId: (deco.spec.authorId as string) ?? ''
		});
	}
	return ranges;
}

function toDecos(ranges: CommentRange[], emphasized: Set<string>, doc: Node): Decoration[] {
	const out: Decoration[] = [];
	for (const range of ranges) {
		if (range.from >= range.to) continue;
		const active = emphasized.has(range.id);
		const attrs = {
			class: active ? 'comment-hl is-emphasized' : 'comment-hl',
			style: range.color ? `--comment-color:${range.color}` : undefined,
			'data-comment-id': range.id
		};
		const spec = {
			id: range.id,
			color: range.color,
			authorId: range.authorId,
			emphasized: active
		};
		out.push(Decoration.inline(range.from, range.to, attrs, spec));
		doc.nodesBetween(range.from, range.to, (node, pos) => {
			if (node.type.name !== 'image') return true;
			const from = pos;
			const to = pos + node.nodeSize;
			if (from >= range.from && to <= range.to) {
				out.push(Decoration.node(from, to, attrs, { ...spec, image: true }));
			}
			return false;
		});
	}
	return out;
}
