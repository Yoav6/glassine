import type { Decoration, NodeView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { documentAssetUrl } from '$lib/md/images';

function applyImageAttrs(img: HTMLImageElement, node: Node, slug: string) {
	img.src = documentAssetUrl(slug, String(node.attrs.src ?? ''));
	img.alt = String(node.attrs.alt ?? '');
	const title = node.attrs.title as string | null;
	if (title) img.title = title;
	else img.removeAttribute('title');
}

/**
 * Mirror comment decoration attrs onto the image wrapper.
 * ProseMirror also applies outer deco attrs; we sync from the deco list so
 * emphasis class changes are never dropped when updateOuterDeco short-circuits.
 */
export function applyImageCommentDecorations(
	el: HTMLElement,
	decorations: readonly Decoration[]
) {
	const comments = decorations.filter((deco) => typeof deco.spec?.id === 'string');
	el.classList.remove('is-emphasized');
	if (!comments.length) {
		el.classList.remove('comment-hl');
		el.removeAttribute('data-comment-id');
		el.removeAttribute('data-comment-ids');
		el.style.removeProperty('--comment-color');
		return;
	}

	el.classList.add('comment-hl');
	const ids = comments.map((deco) => deco.spec!.id as string);
	el.dataset.commentIds = [...new Set(ids)].join(' ');
	const active =
		comments.find((deco) => deco.spec?.emphasized) ?? comments[0]!;
	el.dataset.commentId = active.spec!.id as string;
	const color = (active.spec?.color as string | null) ?? null;
	if (color) el.style.setProperty('--comment-color', color);
	else el.style.removeProperty('--comment-color');
	if (comments.some((deco) => deco.spec?.emphasized)) el.classList.add('is-emphasized');
}

/** Serve vault-relative markdown images through the document asset API. */
export function imageNodeView(slug: string) {
	return (
		node: Node,
		_view: unknown,
		_getPos: unknown,
		decorations: readonly Decoration[]
	): NodeView => {
		const wrap = document.createElement('span');
		wrap.className = 'pm-image';
		const img = document.createElement('img');
		applyImageAttrs(img, node, slug);
		wrap.appendChild(img);
		applyImageCommentDecorations(wrap, decorations);
		return {
			dom: wrap,
			ignoreMutation: () => true,
			update(updated, decos) {
				if (updated.type.name !== 'image') return false;
				applyImageAttrs(img, updated, slug);
				applyImageCommentDecorations(wrap, decos);
				return true;
			}
		};
	};
}
