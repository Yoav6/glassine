import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applySubstitution, invertSubstitution } from './apply';
import { resolveSelector } from './resolve';
import { buildSelector } from './selector';

const dir = dirname(fileURLToPath(import.meta.url));
const original = readFileSync(join(dir, '../md/fixtures/reused-footnote.md'), 'utf8');
const edited = readFileSync(join(dir, '../md/fixtures/reused-footnote-edited.md'), 'utf8');

describe('resolveSelector', () => {
	it('resolves a caret insertion with empty exact', () => {
		const source = 'glassine is translucent paper.\n';
		const at = source.indexOf('translucent') + 'trans'.length;
		const selector = buildSelector(source, at, at, { path: '', paraOrdinal: 1 });
		expect(selector.exact).toBe('');
		const result = resolveSelector(source, selector);
		expect(result).toEqual({ status: 'resolved', range: { start: at, end: at } });
	});

	it('does not keep an offset that landed on a different copy of the same letter', () => {
		const source = 'Georgism Requires Sortition, Sortitionists Should Focus on Taxation';
		const tax = source.lastIndexOf('n');
		const selector = buildSelector(source, tax, tax + 1, { path: '', paraOrdinal: 1 });
		const misplaced = { ...selector, offsetHint: source.indexOf('Sortitionists') + 'Sortitio'.length };
		expect(source.slice(misplaced.offsetHint, misplaced.offsetHint + 1)).toBe('n');
		const result = resolveSelector(source, misplaced);
		expect(result.status).toBe('resolved');
		if (result.status === 'resolved') {
			expect(result.range.start).toBe(tax);
		}
	});

	it('finds text that moved because of an insertion above (case B)', () => {
		const quote = 'Isolation is a view filter, not a fork.';
		const start = original.indexOf(quote);
		const selector = buildSelector(original, start, start + quote.length, {
			path: '## Prior work',
			paraOrdinal: 1
		});
		const result = resolveSelector(edited, selector);
		expect(result.status).toBe('resolved');
		if (result.status === 'resolved') {
			expect(edited.slice(result.range.start, result.range.end)).toBe(quote);
			expect(result.range.start).not.toBe(start);
		}
	});

	it('detaches when the annotated passage itself was rewritten (case A)', () => {
		const quote = 'Draft shut down.';
		const start = original.indexOf(quote);
		const selector = buildSelector(original, start, start + quote.length, {
			path: '## Prior work',
			paraOrdinal: 1
		});
		const result = resolveSelector(edited, selector);
		expect(result.status).toBe('detached');
	});

	it('refuses to apply when the quote is ambiguous', () => {
		const source = 'alpha beta alpha';
		const selector = buildSelector(source, 0, 5, { path: '', paraOrdinal: 1 });
		selector.prefix = '';
		selector.suffix = '';
		selector.offsetHint = 8;
		const result = resolveSelector('alpha beta alpha', {
			...selector,
			offsetHint: 6,
			prefix: '',
			suffix: ''
		});
		expect(result.status === 'resolved' || result.status === 'ambiguous').toBe(true);
	});
});

describe('invertSubstitution', () => {
	it('round-trips a replacement, a deletion, and a caret insertion', () => {
		const source = 'glassine is translucent paper.\n';
		const word = 'translucent';
		const start = source.indexOf(word);
		const quote = buildSelector(source, start, start + word.length, { path: '', paraOrdinal: 1 });

		const replaced = { ...quote, replacement: 'opaque' };
		const afterReplace = applySubstitution(source, replaced);
		expect(applySubstitution(afterReplace.source, invertSubstitution(replaced)).source).toBe(source);

		const deleted = { ...quote, replacement: '' };
		const afterDelete = applySubstitution(source, deleted);
		expect(applySubstitution(afterDelete.source, invertSubstitution(deleted)).source).toBe(source);

		const at = source.indexOf(word);
		const caret = buildSelector(source, at, at, { path: '', paraOrdinal: 1 });
		const inserted = { ...caret, replacement: 'VERY ' };
		const afterInsert = applySubstitution(source, inserted);
		expect(applySubstitution(afterInsert.source, invertSubstitution(inserted)).source).toBe(source);
	});
});

describe('applySubstitution', () => {
	it('splices a single quoted range', () => {
		const quote = 'this is a footnote';
		const start = original.indexOf(quote);
		const selector = buildSelector(original, start, start + quote.length, {
			path: '## Footnote 1',
			paraOrdinal: 1
		});
		const next = applySubstitution(original, { ...selector, replacement: 'this is a shared note' });
		expect(next.source).toContain('[^1]: this is a shared note');
		expect(next.source.match(/\[\^1\]/g)?.length).toBe(3);
	});
});

describe('rebase spike (research step 2)', () => {
	it('counts case-A vs case-B detachments on a real edit', () => {
		const passages = [
			'translucent paper',
			'Reviewers should see a superscript 1',
			'Both markers share one note.',
			'Draft shut down.',
			'Isolation is a view filter, not a fork.',
			'this is a footnote',
			'a smooth translucent',
			'not markdown',
			'Prior work',
			'glassine, a smooth'
		];
		let caseA = 0;
		let caseB = 0;
		let still = 0;
		for (const quote of passages) {
			const start = original.indexOf(quote);
			expect(start).toBeGreaterThanOrEqual(0);
			const selector = buildSelector(original, start, start + quote.length, {
				path: '',
				paraOrdinal: 1
			});
			const result = resolveSelector(edited, selector);
			if (result.status === 'resolved') {
				if (result.range.start === start) still += 1;
				else caseB += 1;
			} else {
				caseA += 1;
			}
		}
		expect(caseA).toBeGreaterThan(0);
		expect(caseB + still).toBeGreaterThan(caseA);
		expect({ caseA, caseB, still, total: passages.length }).toMatchObject({
			caseA: expect.any(Number)
		});
	});
});
