import { describe, expect, it } from 'vitest';
import { applySubstitution } from './apply';
import { buildSelector } from './selector';
import { resolveSelector } from './resolve';
import { mapRangeThroughSplice, retargetSelector } from './retarget';

const hint = { path: '', paraOrdinal: 1 };

describe('mapRangeThroughSplice', () => {
	it('leaves ranges before the edit in place', () => {
		expect(mapRangeThroughSplice({ start: 0, end: 4 }, { start: 10, end: 15, replacement: 'xx' })).toEqual({
			start: 0,
			end: 4
		});
	});

	it('shifts ranges after the edit by the length delta', () => {
		expect(mapRangeThroughSplice({ start: 20, end: 24 }, { start: 10, end: 15, replacement: 'xx' })).toEqual({
			start: 17,
			end: 21
		});
	});

	it('maps an overlapping range onto the replacement', () => {
		expect(mapRangeThroughSplice({ start: 8, end: 16 }, { start: 10, end: 14, replacement: 'RED' })).toEqual({
			start: 8,
			end: 15
		});
	});
});

describe('retargetSelector', () => {
	it('rewrites exact text when a comment covers the accepted edit', () => {
		const source = 'the quick brown fox\n';
		const commentAt = source.indexOf('quick brown fox');
		const comment = buildSelector(source, commentAt, commentAt + 'quick brown fox'.length, hint);
		const editAt = source.indexOf('brown');
		const splice = { start: editAt, end: editAt + 'brown'.length, replacement: 'red' };
		const next = applySubstitution(source, { ...buildSelector(source, splice.start, splice.end, hint), replacement: 'red' });
		const retargeted = retargetSelector(comment, source, next.source, splice, () => hint);
		expect(retargeted?.exact).toBe('quick red fox');
		const resolved = resolveSelector(next.source, retargeted!);
		expect(resolved.status).toBe('resolved');
		if (resolved.status === 'resolved') {
			expect(next.source.slice(resolved.range.start, resolved.range.end)).toBe('quick red fox');
		}
	});

	it('rewrites suffix context when a nearby comment did not overlap the edit', () => {
		const source = 'the quick brown fox jumped\n';
		const commentAt = source.indexOf('the');
		const comment = buildSelector(source, commentAt, commentAt + 3, hint);
		expect(comment.suffix.startsWith(' quick brown')).toBe(true);
		const editAt = source.indexOf('brown');
		const splice = { start: editAt, end: editAt + 'brown'.length, replacement: 'red' };
		const next = applySubstitution(source, { ...buildSelector(source, splice.start, splice.end, hint), replacement: 'red' });
		const retargeted = retargetSelector(comment, source, next.source, splice, () => hint);
		expect(retargeted?.exact).toBe('the');
		expect(retargeted?.suffix).toContain('quick red');
		expect(resolveSelector(next.source, retargeted!).status).toBe('resolved');
	});

	it('keeps a later comment attached after an insertion before it', () => {
		const source = 'hello world\n';
		const world = source.indexOf('world');
		const comment = buildSelector(source, world, world + 5, hint);
		const splice = { start: world, end: world, replacement: 'there ' };
		const next = applySubstitution(source, {
			...buildSelector(source, splice.start, splice.end, hint),
			replacement: 'there '
		});
		const retargeted = retargetSelector(comment, source, next.source, splice, () => hint);
		expect(retargeted?.exact).toBe('world');
		expect(retargeted?.prefix).toContain('there ');
		const resolved = resolveSelector(next.source, retargeted!);
		expect(resolved.status).toBe('resolved');
		if (resolved.status === 'resolved') {
			expect(next.source.slice(resolved.range.start, resolved.range.end)).toBe('world');
		}
	});

	it('patches stored quote text when the selector no longer resolves', () => {
		const source = 'the quick brown fox\n';
		const selector = {
			exact: 'quick brown foxes',
			prefix: 'the ',
			suffix: '',
			offsetHint: 4,
			headingPath: '',
			paraOrdinal: 1
		};
		expect(resolveSelector(source, selector).status).toBe('detached');
		const editAt = source.indexOf('brown');
		const splice = { start: editAt, end: editAt + 'brown'.length, replacement: 'red' };
		const retargeted = retargetSelector(selector, source, 'the quick red fox\n', splice, () => hint);
		expect(retargeted?.exact).toBe('quick red foxes');
	});
});
