import { Schema, type MarkSpec, type NodeSpec } from 'prosemirror-model';
import { addSuggestionMarks, type ExtraAttr } from '@handlewithcare/prosemirror-suggest-changes';

const suggestionExtraAttrs: Record<string, ExtraAttr> = {
	authorId: {
		spec: { default: null, validate: 'string|null' },
		toDOM: (value: unknown): Record<string, string> =>
			typeof value === 'string' ? { 'data-author-id': value } : {},
		parseDOM: (node) => node.dataset['authorId'] ?? null
	},
	highlightColor: {
		spec: { default: null, validate: 'string|null' },
		toDOM: (value: unknown): Record<string, string> =>
			typeof value === 'string'
				? { 'data-highlight': value, style: `--suggestion-color:${value}` }
				: {},
		parseDOM: (node) => node.dataset['highlight'] ?? null
	}
};

const nodes: Record<string, NodeSpec> = {
	doc: {
		content: 'block+',
		marks: 'insertion modification deletion blockBoundarySuggestion'
	},
	paragraph: {
		content: 'inline*',
		group: 'block',
		parseDOM: [{ tag: 'p' }],
		toDOM() {
			return ['p', 0];
		}
	},
	heading: {
		attrs: { level: { default: 1 } },
		content: 'inline*',
		group: 'block',
		defining: true,
		parseDOM: [
			{ tag: 'h1', attrs: { level: 1 } },
			{ tag: 'h2', attrs: { level: 2 } },
			{ tag: 'h3', attrs: { level: 3 } },
			{ tag: 'h4', attrs: { level: 4 } },
			{ tag: 'h5', attrs: { level: 5 } },
			{ tag: 'h6', attrs: { level: 6 } }
		],
		toDOM(node) {
			return [`h${node.attrs.level as number}`, 0];
		}
	},
	blockquote: {
		content: 'block+',
		group: 'block',
		parseDOM: [{ tag: 'blockquote' }],
		toDOM() {
			return ['blockquote', 0];
		}
	},
	code_block: {
		content: 'text*',
		marks: '',
		group: 'block',
		code: true,
		defining: true,
		attrs: { params: { default: '' } },
		parseDOM: [
			{
				tag: 'pre',
				preserveWhitespace: 'full',
				getAttrs: (node) => ({
					params: (node as HTMLElement).getAttribute('data-params') ?? ''
				})
			}
		],
		toDOM(node) {
			return [
				'pre',
				{ 'data-params': node.attrs.params as string, spellcheck: 'false' },
				['code', 0]
			];
		}
	},
	horizontal_rule: {
		group: 'block',
		parseDOM: [{ tag: 'hr' }],
		toDOM() {
			return ['hr'];
		}
	},
	bullet_list: {
		content: 'list_item+',
		group: 'block',
		parseDOM: [{ tag: 'ul' }],
		toDOM() {
			return ['ul', 0];
		}
	},
	ordered_list: {
		content: 'list_item+',
		group: 'block',
		attrs: { order: { default: 1 } },
		parseDOM: [
			{
				tag: 'ol',
				getAttrs: (node) => ({
					order: Number((node as HTMLElement).getAttribute('start') ?? 1)
				})
			}
		],
		toDOM(node) {
			return node.attrs.order === 1
				? ['ol', 0]
				: ['ol', { start: node.attrs.order as number }, 0];
		}
	},
	list_item: {
		content: 'block+',
		defining: true,
		parseDOM: [{ tag: 'li' }],
		toDOM() {
			return ['li', 0];
		}
	},
	table: {
		content: 'table_row+',
		group: 'block',
		isolating: true,
		parseDOM: [{ tag: 'table' }],
		toDOM() {
			return ['table', ['tbody', 0]];
		}
	},
	table_row: {
		content: '(table_cell | table_header)+',
		parseDOM: [{ tag: 'tr' }],
		toDOM() {
			return ['tr', 0];
		}
	},
	table_cell: {
		content: 'block+',
		isolating: true,
		parseDOM: [{ tag: 'td' }],
		toDOM() {
			return ['td', 0];
		}
	},
	table_header: {
		content: 'block+',
		isolating: true,
		parseDOM: [{ tag: 'th' }],
		toDOM() {
			return ['th', 0];
		}
	},
	footnote: {
		content: 'block+',
		group: 'block',
		isolating: true,
		attrs: { identifier: { default: '1' }, label: { default: '1' } },
		parseDOM: [
			{
				tag: 'aside.footnote',
				getAttrs: (node) => ({
					identifier: (node as HTMLElement).dataset.identifier ?? '1',
					label: (node as HTMLElement).dataset.label ?? '1'
				})
			}
		],
		toDOM(node) {
			return [
				'aside',
				{
					class: 'footnote',
					'data-identifier': node.attrs.identifier as string,
					'data-label': node.attrs.label as string,
					id: `fn-${node.attrs.identifier as string}`
				},
				['span', { class: 'footnote-label', contenteditable: 'false' }, node.attrs.label as string],
				['div', { class: 'footnote-body' }, 0]
			];
		}
	},
	footnote_ref: {
		inline: true,
		atom: true,
		group: 'inline',
		selectable: true,
		attrs: { identifier: { default: '1' }, label: { default: '1' } },
		parseDOM: [
			{
				tag: 'sup.fn-ref',
				getAttrs: (node) => ({
					identifier: (node as HTMLElement).dataset.identifier ?? '1',
					label: (node as HTMLElement).dataset.label ?? '1'
				})
			}
		],
		toDOM(node) {
			return [
				'sup',
				{
					class: 'fn-ref',
					'data-identifier': node.attrs.identifier as string,
					'data-label': node.attrs.label as string
				},
				node.attrs.label as string
			];
		}
	},
	image: {
		inline: true,
		atom: true,
		group: 'inline',
		attrs: { src: { default: '' }, alt: { default: '' }, title: { default: null } },
		parseDOM: [
			{
				tag: 'img',
				getAttrs: (node) => ({
					src: (node as HTMLElement).getAttribute('src') ?? '',
					alt: (node as HTMLElement).getAttribute('alt') ?? '',
					title: (node as HTMLElement).getAttribute('title')
				})
			}
		],
		toDOM(node) {
			return [
				'img',
				{
					src: node.attrs.src as string,
					alt: node.attrs.alt as string,
					title: (node.attrs.title as string | null) ?? undefined
				}
			];
		}
	},
	hard_break: {
		inline: true,
		group: 'inline',
		selectable: false,
		parseDOM: [{ tag: 'br' }],
		toDOM() {
			return ['br'];
		}
	},
	text: { group: 'inline' }
};

const baseMarks: Record<string, MarkSpec> = {
	em: {
		parseDOM: [
			{ tag: 'i' },
			{ tag: 'em' },
			{ style: 'font-style=italic' },
			{ style: 'font-style=normal', clearMark: (m) => m.type.name === 'em' }
		],
		toDOM() {
			return ['em', 0];
		}
	},
	strong: {
		parseDOM: [
			{ tag: 'strong' },
			{ tag: 'b' },
			{ style: 'font-weight=bold' },
			{ style: 'font-weight=700' }
		],
		toDOM() {
			return ['strong', 0];
		}
	},
	code: {
		excludes: '_',
		parseDOM: [{ tag: 'code' }],
		toDOM() {
			return ['code', 0];
		}
	},
	link: {
		attrs: { href: {}, title: { default: null } },
		inclusive: false,
		parseDOM: [
			{
				tag: 'a[href]',
				getAttrs: (node) => ({
					href: (node as HTMLElement).getAttribute('href'),
					title: (node as HTMLElement).getAttribute('title')
				})
			}
		],
		toDOM(node) {
			return ['a', { href: node.attrs.href as string, title: node.attrs.title as string | null }, 0];
		}
	},
	strikethrough: {
		parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
		toDOM() {
			return ['s', 0];
		}
	}
};

export const schema = new Schema({
	nodes,
	marks: addSuggestionMarks(baseMarks, suggestionExtraAttrs)
});
