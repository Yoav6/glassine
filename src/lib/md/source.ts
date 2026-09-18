import type { Node } from 'prosemirror-model';
import { schema } from './schema';
import { PositionMap } from './positionMap';
import type { ParseResult } from './parse';

/** First character of the `source` block (doc → source → text). */
const SOURCE_CONTENT_POS = 1;

export function parseSource(source: string): ParseResult {
	const text = source ? schema.text(source) : null;
	const block = schema.node('source', null, text ? [text] : []);
	const doc = schema.node('doc', null, [block]);
	const map = new PositionMap([
		{
			docPos: SOURCE_CONTENT_POS,
			docLen: source.length,
			srcOffset: 0,
			srcLen: source.length,
			linear: true
		}
	]);
	return {
		doc,
		map,
		source,
		hintsAt: () => ({ path: '', paraOrdinal: 1 })
	};
}

export function serializeSourceDoc(doc: Node): string {
	let out = '';
	doc.descendants((node) => {
		if (!node.isText) return true;
		const insertion = node.marks.some((mark) => mark.type.name === 'insertion');
		const deletion = node.marks.some((mark) => mark.type.name === 'deletion');
		if (insertion && !deletion) return true;
		out += node.text ?? '';
		return true;
	});
	return out;
}
