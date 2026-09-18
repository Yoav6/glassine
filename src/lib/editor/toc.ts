import type { Node as PMNode } from 'prosemirror-model';
import { yamlFrontmatterEnd } from '$lib/md';

export type TocItem = {
	pos: number;
	level: number;
	text: string;
};

const ATX = /^(#{1,6})\s+(\S.*?)\s*$/;
const FENCE = /^(`{3,}|~{3,})/;

export function extractToc(doc: PMNode): TocItem[] {
	const headings = extractHeadingNodes(doc);
	const source = extractSourceHeadings(doc);
	if (source.length) return [...headings, ...source];
	return headings;
}

export function tocMinLevel(items: TocItem[]): number {
	if (!items.length) return 1;
	return items.reduce((min, item) => Math.min(min, item.level), 6);
}

export function tocIndent(level: number, minLevel: number): number {
	return Math.max(0, level - minLevel);
}

/** Index of the last heading whose top is at or above the reading line. */
export function pickActiveTocIndex(tops: number[], threshold: number): number | null {
	if (!tops.length) return null;
	let index = 0;
	for (let i = 0; i < tops.length; i++) {
		if (tops[i]! <= threshold) index = i;
		else break;
	}
	return index;
}

function extractHeadingNodes(doc: PMNode): TocItem[] {
	const items: TocItem[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'footnote') return false;
		if (node.type.name !== 'heading') return true;
		const text = headingLabel(node);
		if (text) items.push({ pos, level: node.attrs.level as number, text });
		return false;
	});
	return items;
}

function extractSourceHeadings(doc: PMNode): TocItem[] {
	const items: TocItem[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== 'source') return true;
		const raw = node.textContent;
		const start = yamlFrontmatterEnd(raw);
		let i = start;
		let inFence = false;
		while (i <= raw.length) {
			const nl = raw.indexOf('\n', i);
			const end = nl < 0 ? raw.length : nl;
			const line = raw.slice(i, end).replace(/\r$/, '');
			if (FENCE.test(line)) {
				inFence = !inFence;
			} else if (!inFence) {
				const match = line.match(ATX);
				const text = match?.[2]?.replace(/\s+#+\s*$/, '').trim();
				if (match && text) {
					items.push({
						pos: pos + 1 + i,
						level: match[1]!.length,
						text
					});
				}
			}
			if (nl < 0) break;
			i = end + 1;
		}
		return false;
	});
	return items;
}

function headingLabel(node: PMNode): string {
	return node.textContent.replace(/\s+/g, ' ').trim();
}
