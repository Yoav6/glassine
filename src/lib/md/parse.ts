import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type {
	BlockContent,
	DefinitionContent,
	List,
	ListItem,
	PhrasingContent,
	Root,
	RootContent,
	Table,
	TableCell,
	TableRow
} from 'mdast';
import { Mark, Node } from 'prosemirror-model';
import { schema } from './schema';
import { PositionMap, type MapSegment } from './positionMap';
import { materializeBlankParagraphs } from './blankLines';

export type HeadingHint = {
	path: string;
	paraOrdinal: number;
};

export type ParseResult = {
	doc: Node;
	map: PositionMap;
	source: string;
	hintsAt: (srcOffset: number) => HeadingHint;
};

type LeafRecord = {
	srcOffset: number;
	srcLen: number;
	value: string;
	linear: boolean;
	kind: 'text' | 'atom';
};

type HintPoint = {
	srcOffset: number;
	path: string;
	paraOrdinal: number;
};

const processor = unified().use(remarkParse).use(remarkGfm);

/** Exclusive end offset of leading YAML frontmatter, or 0 if none. */
export function yamlFrontmatterEnd(source: string): number {
	const bom = source.startsWith('\uFEFF') ? 1 : 0;
	const body = source.slice(bom);
	const open = body.match(/^---\r?\n/);
	if (!open) return 0;
	const close = new RegExp('\\r?\\n(?:---|\\.\\.\\.)(?:\\r?\\n|$)', 'g');
	close.lastIndex = open[0].length;
	const match = close.exec(body);
	if (!match) return 0;
	return bom + match.index + match[0].length;
}

export function parseMarkdown(source: string): ParseResult {
	const skipUntil = yamlFrontmatterEnd(source);
	const normalized =
		source.slice(0, skipUntil) + materializeBlankParagraphs(source.slice(skipUntil));
	const tree = processor.parse(normalized) as Root;
	const ctx: BuildContext = {
		source: normalized,
		leaves: [],
		hints: [],
		headingStack: [],
		paraOrdinal: 0
	};
	const blocks: Node[] = [];
	const footnotes: Node[] = [];

	for (const child of tree.children) {
		const start = child.position?.start.offset;
		if (skipUntil && start != null && start < skipUntil) continue;
		if (child.type === 'footnoteDefinition') {
			footnotes.push(buildFootnote(child, ctx));
		} else {
			const node = buildBlock(child, ctx);
			if (node) blocks.push(node);
		}
	}

	const content = [...blocks, ...footnotes];
	const doc = schema.node(
		'doc',
		null,
		content.length ? content : [schema.node('paragraph')]
	);

	const segments = collectSegments(doc, ctx.leaves);
	const map = new PositionMap(segments);
	const hints = ctx.hints;

	return {
		doc,
		map,
		source: normalized,
		hintsAt(srcOffset: number) {
			let last: HeadingHint = { path: '', paraOrdinal: 0 };
			for (const hint of hints) {
				if (hint.srcOffset > srcOffset) break;
				last = { path: hint.path, paraOrdinal: hint.paraOrdinal };
			}
			return last;
		}
	};
}

type BuildContext = {
	source: string;
	leaves: LeafRecord[];
	hints: HintPoint[];
	headingStack: { level: number; text: string }[];
	paraOrdinal: number;
};

function buildBlock(node: RootContent | BlockContent | DefinitionContent, ctx: BuildContext): Node | null {
	switch (node.type) {
		case 'paragraph': {
			ctx.paraOrdinal += 1;
			recordHint(node, ctx);
			return schema.node('paragraph', null, buildPhrasing(node.children, ctx, []));
		}
		case 'heading': {
			const text = phrasingText(node.children);
			ctx.headingStack = ctx.headingStack.filter((h) => h.level < node.depth);
			ctx.headingStack.push({ level: node.depth, text });
			ctx.paraOrdinal = 0;
			recordHint(node, ctx);
			return schema.node('heading', { level: node.depth }, buildPhrasing(node.children, ctx, []));
		}
		case 'blockquote': {
			const inner = node.children
				.map((child) => buildBlock(child, ctx))
				.filter((n): n is Node => n !== null);
			return schema.node('blockquote', null, inner.length ? inner : [schema.node('paragraph')]);
		}
		case 'code': {
			recordHint(node, ctx);
			const text = node.value ?? '';
			noteTextLeaf(node, text, ctx);
			return schema.node(
				'code_block',
				{ params: node.lang ?? '' },
				text ? [schema.text(text)] : []
			);
		}
		case 'thematicBreak':
			return schema.node('horizontal_rule');
		case 'list':
			return buildList(node, ctx);
		case 'table':
			return buildTable(node, ctx);
		case 'html': {
			recordHint(node, ctx);
			noteTextLeaf(node, node.value, ctx);
			return schema.node('paragraph', null, node.value ? [schema.text(node.value)] : []);
		}
		default:
			return null;
	}
}

function buildFootnote(
	node: Extract<RootContent, { type: 'footnoteDefinition' }>,
	ctx: BuildContext
): Node {
	const prevPath = ctx.headingStack.slice();
	const prevPara = ctx.paraOrdinal;
	ctx.headingStack = [{ level: 2, text: `Footnote ${node.label ?? node.identifier}` }];
	ctx.paraOrdinal = 0;
	const inner = node.children
		.map((child) => buildBlock(child, ctx))
		.filter((n): n is Node => n !== null);
	ctx.headingStack = prevPath;
	ctx.paraOrdinal = prevPara;
	return schema.node(
		'footnote',
		{ identifier: node.identifier, label: node.label ?? node.identifier },
		inner.length ? inner : [schema.node('paragraph')]
	);
}

function buildList(node: List, ctx: BuildContext): Node {
	const items = node.children.map((item) => buildListItem(item, ctx));
	if (node.ordered) {
		return schema.node('ordered_list', { order: node.start ?? 1 }, items);
	}
	return schema.node('bullet_list', null, items);
}

function buildListItem(node: ListItem, ctx: BuildContext): Node {
	const inner = node.children
		.map((child) => buildBlock(child as RootContent, ctx))
		.filter((n): n is Node => n !== null);
	return schema.node('list_item', null, inner.length ? inner : [schema.node('paragraph')]);
}

function buildTable(node: Table, ctx: BuildContext): Node {
	const rows = node.children.map((row, index) => buildTableRow(row, ctx, index === 0));
	return schema.node('table', null, rows);
}

function buildTableRow(node: TableRow, ctx: BuildContext, header: boolean): Node {
	const cells = node.children.map((cell) => buildTableCell(cell, ctx, header));
	return schema.node('table_row', null, cells);
}

function buildTableCell(node: TableCell, ctx: BuildContext, header: boolean): Node {
	ctx.paraOrdinal += 1;
	recordHint(node, ctx);
	const para = schema.node('paragraph', null, buildPhrasing(node.children, ctx, []));
	return schema.node(header ? 'table_header' : 'table_cell', null, [para]);
}

function buildPhrasing(nodes: PhrasingContent[], ctx: BuildContext, marks: Mark[]): Node[] {
	const out: Node[] = [];
	for (const node of nodes) {
		out.push(...phrasing(node, ctx, marks));
	}
	return out;
}

function phrasing(node: PhrasingContent, ctx: BuildContext, marks: Mark[]): Node[] {
	switch (node.type) {
		case 'text': {
			noteTextLeaf(node, node.value, ctx);
			return node.value ? [schema.text(node.value, marks)] : [];
		}
		case 'emphasis':
			return buildPhrasing(node.children, ctx, [...marks, schema.marks.em.create()]);
		case 'strong':
			return buildPhrasing(node.children, ctx, [...marks, schema.marks.strong.create()]);
		case 'delete':
			return buildPhrasing(node.children, ctx, [...marks, schema.marks.strikethrough.create()]);
		case 'inlineCode': {
			noteTextLeaf(node, node.value, ctx);
			return node.value
				? [schema.text(node.value, [...marks, schema.marks.code.create()])]
				: [];
		}
		case 'link': {
			const mark = schema.marks.link.create({ href: node.url, title: node.title ?? null });
			return buildPhrasing(node.children, ctx, [...marks, mark]);
		}
		case 'break':
			return [schema.node('hard_break')];
		case 'footnoteReference': {
			noteAtomLeaf(node, ctx);
			return [
				schema.node('footnote_ref', {
					identifier: node.identifier,
					label: node.label ?? node.identifier
				})
			];
		}
		case 'image': {
			noteAtomLeaf(node, ctx);
			return [
				schema.node('image', {
					src: node.url,
					alt: node.alt ?? '',
					title: node.title ?? null
				})
			];
		}
		case 'html': {
			noteTextLeaf(node, node.value, ctx);
			return node.value ? [schema.text(node.value, marks)] : [];
		}
		default:
			return [];
	}
}

function noteTextLeaf(
	node: { position?: { start: { offset?: number }; end: { offset?: number } } },
	value: string,
	ctx: BuildContext
) {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start == null || end == null) return;
	const srcSlice = ctx.source.slice(start, end);
	const linear = srcSlice === value;
	ctx.leaves.push({
		srcOffset: start,
		srcLen: end - start,
		value,
		linear,
		kind: 'text'
	});
}

function noteAtomLeaf(
	node: { position?: { start: { offset?: number }; end: { offset?: number } } },
	ctx: BuildContext
) {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start == null || end == null) return;
	ctx.leaves.push({
		srcOffset: start,
		srcLen: end - start,
		value: ctx.source.slice(start, end),
		linear: true,
		kind: 'atom'
	});
}

function recordHint(
	node: { position?: { start: { offset?: number } } },
	ctx: BuildContext
) {
	const offset = node.position?.start.offset;
	if (offset == null) return;
	ctx.hints.push({
		srcOffset: offset,
		path: headingPath(ctx.headingStack),
		paraOrdinal: ctx.paraOrdinal
	});
}

function headingPath(stack: { level: number; text: string }[]): string {
	return stack.map((h) => `${'#'.repeat(h.level)} ${h.text}`).join(' › ');
}

function phrasingText(nodes: PhrasingContent[]): string {
	return nodes
		.map((node) => {
			if (node.type === 'text') return node.value;
			if ('children' in node && Array.isArray(node.children)) {
				return phrasingText(node.children as PhrasingContent[]);
			}
			if (node.type === 'inlineCode') return node.value;
			return '';
		})
		.join('');
}

function collectSegments(doc: Node, leaves: LeafRecord[]): MapSegment[] {
	const segments: MapSegment[] = [];
	let index = 0;
	doc.descendants((node, pos) => {
		if (node.isText) {
			const leaf = leaves[index++];
			if (!leaf) return;
			segments.push({
				docPos: pos,
				docLen: node.nodeSize,
				srcOffset: leaf.srcOffset,
				srcLen: leaf.srcLen,
				linear: leaf.linear && leaf.value === node.text
			});
			return false;
		}
		if (node.type.name === 'footnote_ref' || node.type.name === 'image') {
			const leaf = leaves[index++];
			if (!leaf) return;
			segments.push({
				docPos: pos,
				docLen: node.nodeSize,
				srcOffset: leaf.srcOffset,
				srcLen: leaf.srcLen,
				linear: false
			});
			return false;
		}
		return true;
	});
	return segments;
}
