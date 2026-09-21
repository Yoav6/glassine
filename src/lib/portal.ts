/**
 * Svelte action that moves a node to the end of <body> for as long as it is mounted.
 * A modal <dialog> opened from inside another dialog is easier to reason about (focus,
 * light dismiss, clipping) when it is not one of that dialog's DOM descendants.
 */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
