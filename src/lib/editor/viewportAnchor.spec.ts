import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseSource } from '$lib/md';
import {
	fractionScrollDelta,
	resolveAnchorPos,
	scrollDelta,
	snippetAroundPos
} from './viewportAnchor';

describe('viewportAnchor', () => {
	it('maps a rendered position onto the source surface via source offsets', () => {
		const source = '# Title\n\nHello **world** from glassine.\n';
		const article = parseMarkdown(source);
		const raw = parseSource(source);
		const at = article.doc.textContent.indexOf('glassine');
		const articlePos = article.map.srcToDoc(source.indexOf('glassine'))!.pos;
		const snippet = snippetAroundPos(article.doc, articlePos);
		expect(article.doc.textBetween(articlePos, articlePos + 8)).toBe('glassine');
		expect(snippet.needle).toContain('glassine');

		const resolved = resolveAnchorPos(raw.doc, raw.map, {
			srcOffset: article.map.docToSrc(articlePos)!.offset,
			needle: snippet.needle,
			needleAt: snippet.needleAt
		});
		expect(resolved).not.toBeNull();
		expect(raw.doc.textBetween(resolved!, resolved! + 8)).toBe('glassine');
		expect(at).toBeGreaterThan(-1);
	});

	it('maps a source-surface position back onto rendered markdown', () => {
		const source = 'Intro paragraph.\n\n## Later heading\n\nBody after the heading.\n';
		const article = parseMarkdown(source);
		const raw = parseSource(source);
		const srcAt = source.indexOf('Later heading');
		const sourcePos = raw.map.srcToDoc(srcAt)!.pos;
		const snippet = snippetAroundPos(raw.doc, sourcePos);

		const resolved = resolveAnchorPos(article.doc, article.map, {
			srcOffset: srcAt,
			needle: snippet.needle,
			needleAt: snippet.needleAt
		});
		expect(resolved).not.toBeNull();
		expect(article.doc.textBetween(resolved!, resolved! + 13)).toBe('Later heading');
	});

	it('prefers a matching needle when the source map would land elsewhere', () => {
		const preview = parseMarkdown('The dog sat on the mat.\n');
		const dogPos = preview.map.srcToDoc(preview.source.indexOf('dog'))!.pos;
		const snippet = snippetAroundPos(preview.doc, dogPos);
		const resolved = resolveAnchorPos(preview.doc, preview.map, {
			srcOffset: 0,
			needle: snippet.needle,
			needleAt: snippet.needleAt
		});
		expect(resolved).not.toBeNull();
		expect(preview.doc.textBetween(resolved!, resolved! + 3)).toBe('dog');
	});

	it('computes the scroll delta that keeps a point at the same viewport Y', () => {
		expect(scrollDelta(400, 120)).toBe(280);
		expect(fractionScrollDelta(100, 1000, 0.4, 120)).toBe(380);
	});
});
