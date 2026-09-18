import { describe, expect, it } from 'vitest';
import { groupReviewersByAccess } from './access';

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
