import { describe, expect, it } from 'vitest';
import { cleanSuggestingCss, hiddenAnnotationsCss, isAuthorShown } from './annotation-visibility';

const reviewer = { id: 'me', role: 'reviewer' };
const author = { id: 'author', role: 'author' };

const sources = [
	{ id: 'me', name: 'Me', role: 'reviewer' as const },
	{ id: 'author', name: 'Ann', role: 'author' as const },
	{ id: 'other', name: 'Bo', role: 'reviewer' as const }
];

describe('isAuthorShown', () => {
	it('shows only the reviewer and the author by default', () => {
		expect(isAuthorShown('me', {}, reviewer, sources)).toBe(true);
		expect(isAuthorShown('author', {}, reviewer, sources)).toBe(true);
		expect(isAuthorShown('other', {}, reviewer, sources)).toBe(false);
	});

	it('lets explicit choices override the defaults in both directions', () => {
		expect(isAuthorShown('other', { other: true }, reviewer, sources)).toBe(true);
		expect(isAuthorShown('me', { me: false }, reviewer, sources)).toBe(false);
		expect(isAuthorShown('author', { author: false }, reviewer, sources)).toBe(false);
	});

	it('shows everyone to an author by default, until they hide someone', () => {
		expect(isAuthorShown('other', {}, author, sources)).toBe(true);
		expect(isAuthorShown('me', {}, author, sources)).toBe(true);
		expect(isAuthorShown('ghost', {}, author, sources)).toBe(true);
		expect(isAuthorShown('other', { other: false }, author, sources)).toBe(false);
	});

	it('hides people who are not listed, except the reviewer', () => {
		expect(isAuthorShown('ghost', {}, reviewer, sources)).toBe(false);
		expect(isAuthorShown('me', {}, reviewer, [])).toBe(true);
	});
});

describe('hiddenAnnotationsCss', () => {
	it('is empty when nobody is hidden', () => {
		expect(hiddenAnnotationsCss([])).toBe('');
	});

	it('hides insertions, un-strikes deletions, and hides comment highlights, the viewer included', () => {
		for (const id of ['me', 'bo']) {
			const css = hiddenAnnotationsCss([id]);
			expect(css).toContain(`ins[data-author-id="${id}"]{display:none !important}`);
			expect(css).toContain(`del[data-author-id="${id}"]{background:none`);
			expect(css).not.toContain(`del[data-author-id="${id}"]{display:none`);
			expect(css).toContain(`.comment-hl[data-author-id="${id}"]`);
		}
	});

	it('skips ids that are not safe to put in a selector', () => {
		expect(hiddenAnnotationsCss(['a"]{}x'])).toBe('');
	});
});

describe('cleanSuggestingCss', () => {
	it('makes the viewer’s own insertions read as plain text and deletions disappear', () => {
		const css = cleanSuggestingCss('me');
		expect(css).toContain('ins[data-author-id="me"]{background:none !important}');
		expect(css).toContain('del[data-author-id="me"]{display:none !important}');
		expect(css).not.toContain('comment-hl');
	});

	it('skips an id that is not safe to put in a selector', () => {
		expect(cleanSuggestingCss('a"]{}x')).toBe('');
	});
});
