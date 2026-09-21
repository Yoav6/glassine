import { describe, expect, it } from 'vitest';
import { destinationWithoutInviteToken, inviteRedeemAction } from './invite';

describe('inviteRedeemAction', () => {
	it('names the action and keeps the token in the query', () => {
		expect(inviteRedeemAction('a b', 'redeem')).toBe('?/redeem&token=a%20b');
	});
});

describe('destinationWithoutInviteToken', () => {
	it('drops the token', () => {
		expect(destinationWithoutInviteToken(new URL('http://x/documents/d?token=t'))).toBe('/documents/d');
	});

	it('drops the action marker of the posted form but keeps other params', () => {
		expect(
			destinationWithoutInviteToken(new URL('http://x/documents/d?/redeem&token=t&view=reading'))
		).toBe('/documents/d?view=reading');
	});
});
