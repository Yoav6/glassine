import { describe, expect, it } from 'vitest';
import { hiddenAuthorsCss, isAuthorShown } from './annotation-visibility';

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

describe('hiddenAuthorsCss', () => {
	it('is empty when nobody is hidden', () => {
		expect(hiddenAuthorsCss([], 'me')).toBe('');
	});

	it('makes your own hidden suggestions read as plain edits', () => {
		const css = hiddenAuthorsCss(['me'], 'me');
		expect(css).toContain('ins[data-author-id="me"]{background:none !important}');
		expect(css).toContain('del[data-author-id="me"]{display:none !important}');
	});

	it("makes someone else's hidden suggestions read as never made", () => {
		const css = hiddenAuthorsCss(['bo'], 'me');
		expect(css).toContain('ins[data-author-id="bo"]{display:none !important}');
		expect(css).toContain('del[data-author-id="bo"]{background:none');
		expect(css).toContain('.comment-hl[data-author-id="bo"]');
	});

	it('skips ids that are not safe to put in a selector', () => {
		expect(hiddenAuthorsCss(['a"]{}x'], 'me')).toBe('');
	});
});
