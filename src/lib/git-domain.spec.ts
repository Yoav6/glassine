import { describe, expect, it } from 'vitest';
import { defaultGitDomain } from './git-domain';

describe('defaultGitDomain', () => {
	it('puts the git host beside an app subdomain', () => {
		expect(defaultGitDomain('glassine.yoavravid.com')).toBe('glassine-git.yoavravid.com');
		expect(defaultGitDomain('review.notes.example.org')).toBe('glassine-git.notes.example.org');
	});

	it('puts the git host under an apex domain', () => {
		expect(defaultGitDomain('example.com')).toBe('glassine-git.example.com');
	});

	it('handles a bare hostname', () => {
		expect(defaultGitDomain('localhost')).toBe('glassine-git.localhost');
	});
});
