import { describe, expect, it } from 'vitest';
import {
	customSelection,
	groupReviewersByAccess,
	parseScope,
	scopeKind,
	serializeScope,
	sortPeople,
	visibleAuthorIds
} from './access';

const alice = { id: 'a', name: 'Alice' };
const bob = { id: 'b', name: 'Bob' };
const carol = { id: 'c', name: 'carol' };
const dave = { id: 'd', name: 'Dave' };

describe('groupReviewersByAccess', () => {
	it('puts people with access first, each group A–Z', () => {
		expect(
			groupReviewersByAccess([alice, dave, bob, carol], ['d', 'b']).granted.map((row) => row.name)
		).toEqual(['Bob', 'Dave']);
		expect(
			groupReviewersByAccess([alice, dave, bob, carol], ['d', 'b']).others.map((row) => row.name)
		).toEqual(['Alice', 'carol']);
	});

	it('sorts case-insensitively and uses id when names match', () => {
		const annA = { id: 'z', name: 'Ann' };
		const annB = { id: 'm', name: 'ann' };
		expect(groupReviewersByAccess([annA, annB], []).others.map((row) => row.id)).toEqual(['m', 'z']);
	});

	it('treats an empty grant list as no access', () => {
		const grouped = groupReviewersByAccess([bob, alice], []);
		expect(grouped.granted).toEqual([]);
		expect(grouped.others.map((row) => row.name)).toEqual(['Alice', 'Bob']);
	});
});

describe('annotation scope', () => {
	const users = [
		{ id: 'author', role: 'author' },
		{ id: 'r1', role: 'reviewer' },
		{ id: 'r2', role: 'reviewer' },
		{ id: 'r3', role: 'reviewer' }
	];

	it('reads the legacy own scope and an empty value as the default', () => {
		expect(parseScope('own')).toEqual({ kind: 'default' });
		expect(parseScope('')).toEqual({ kind: 'default' });
		expect(parseScope(null)).toEqual({ kind: 'default' });
		expect(parseScope('default')).toEqual({ kind: 'default' });
	});

	it('round-trips custom scopes, including an empty selection', () => {
		expect(serializeScope({ kind: 'custom', ids: ['a', 'b'] })).toBe('custom:a,b');
		expect(parseScope('custom:a,b')).toEqual({ kind: 'custom', ids: ['a', 'b'] });
		expect(parseScope(serializeScope({ kind: 'custom', ids: [] }))).toEqual({ kind: 'custom', ids: [] });
		expect(parseScope('a, b,a')).toEqual({ kind: 'custom', ids: ['a', 'b'] });
	});

	it('shows all and custom scopes as Custom, everything else as Default', () => {
		expect(scopeKind('own')).toBe('default');
		expect(scopeKind('default')).toBe('default');
		expect(scopeKind('all')).toBe('custom');
		expect(scopeKind('custom:r2')).toBe('custom');
	});

	it('gives the default scope the reviewer and the author', () => {
		expect([...visibleAuthorIds(parseScope('default'), 'r1', users)].sort()).toEqual(['author', 'r1']);
	});

	it('gives a custom scope only the chosen people plus the reviewer', () => {
		expect([...visibleAuthorIds(parseScope('custom:r2'), 'r1', users)].sort()).toEqual(['r1', 'r2']);
		expect([...visibleAuthorIds(parseScope('custom:'), 'r1', users)]).toEqual(['r1']);
	});

	it('ignores custom ids that are not users', () => {
		expect([...visibleAuthorIds(parseScope('custom:ghost'), 'r1', users)]).toEqual(['r1']);
	});

	it('gives the all scope everyone', () => {
		expect(visibleAuthorIds(parseScope('all'), 'r1', users).size).toBe(4);
	});

	it('pre-ticks the author in the picker for a default scope', () => {
		const people = users.filter((person) => person.id !== 'r1').map((person) => ({
			...person,
			name: person.id
		})) as import('./access').AccessPerson[];
		expect(customSelection('default', people)).toEqual(['author']);
		expect(customSelection('custom:r3', people)).toEqual(['r3']);
		expect(customSelection('all', people)).toEqual(['author', 'r2', 'r3']);
	});

	it('sorts authors before reviewers', () => {
		const sorted = sortPeople([
			{ id: '1', name: 'Zed', role: 'author' as const },
			{ id: '2', name: 'Amy', role: 'reviewer' as const },
			{ id: '3', name: 'Ann', role: 'author' as const }
		]);
		expect(sorted.map((person) => person.name)).toEqual(['Ann', 'Zed', 'Amy']);
	});
});
