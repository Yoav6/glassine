import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export function joinPreview(): Plugin {
	return new Plugin({
		props: {
			decorations(state) {
				const decos: Decoration[] = [];
				const boundary = state.schema.marks.blockBoundarySuggestion;
				if (!boundary) return null;
				state.doc.forEach((node, offset) => {
					if (!node.isTextblock) return;
					const mark = boundary.isInSet(node.marks);
					if (mark && mark.attrs.type === 'deletion') {
						decos.push(
							Decoration.node(offset, offset + node.nodeSize, {
								class: 'pending-join'
							})
						);
						const next = state.doc.childAfter(offset + node.nodeSize);
						if (next.node?.isTextblock) {
							decos.push(
								Decoration.node(next.offset, next.offset + next.node.nodeSize, {
									class: 'pending-join-next'
								})
							);
						}
					}
				});
				return DecorationSet.create(state.doc, decos);
			}
		}
	});
}
