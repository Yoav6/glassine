import { describe, expect, it } from 'vitest';
import {
	accountLabel,
	destinationAfterLeavingAccount,
	destinationForAccount,
	isAccountChoiceExemptPath,
	needsAccountChoice,
	safeNext,
	shouldForceAccountChooser
} from './accounts';

const alice = { id: 'alice', name: 'Alice', role: 'reviewer' as const };
const bob = { id: 'bob', name: 'Bob', role: 'reviewer' as const };
const author = { id: 'author', name: 'Author', role: 'author' as const };

describe('needsAccountChoice', () => {
	it('does not prompt when only one account is on the device', () => {
		expect(
			needsAccountChoice({
				accounts: [alice],
				visitUserId: undefined,
				sessionUserId: alice.id
			})
		).toBe(false);
	});

	it('prompts on a fresh visit when two accounts are present', () => {
		expect(
			needsAccountChoice({
				accounts: [alice, bob],
				visitUserId: undefined,
				sessionUserId: bob.id
			})
		).toBe(true);
	});

	it('does not prompt after an explicit choice matching the active session', () => {
		expect(
			needsAccountChoice({
				accounts: [alice, bob],
				visitUserId: alice.id,
				sessionUserId: alice.id
			})
		).toBe(false);
	});

	it('prompts again if the remembered visit does not match the active session', () => {
		expect(
			needsAccountChoice({
				accounts: [alice, bob],
				visitUserId: alice.id,
				sessionUserId: bob.id
			})
		).toBe(true);
	});
});

describe('shouldForceAccountChooser', () => {
	it('prompts in a new tab when multiple accounts exist and this tab has not chosen', () => {
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: true,
				tabAccountId: null,
				pathname: '/reviews'
			})
		).toBe(true);
	});

	it('does not prompt after this tab has chosen, or with a single account', () => {
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: true,
				tabAccountId: 'alice',
				pathname: '/reviews'
			})
		).toBe(false);
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: false,
				tabAccountId: null,
				pathname: '/reviews'
			})
		).toBe(false);
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: true,
				tabAccountId: null,
				pathname: '/choose'
			})
		).toBe(false);
	});

	it('prompts when another live tab already holds the copied choice', () => {
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: true,
				tabAccountId: 'alice',
				pathname: '/reviews',
				choiceHeldByAnotherTab: true
			})
		).toBe(true);
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: true,
				tabAccountId: 'alice',
				pathname: '/reviews',
				choiceHeldByAnotherTab: true,
				isReload: true
			})
		).toBe(false);
	});
});

describe('isAccountChoiceExemptPath', () => {
	it('allows sign-in, invite, setup, and the chooser itself', () => {
		expect(isAccountChoiceExemptPath('/choose')).toBe(true);
		expect(isAccountChoiceExemptPath('/login')).toBe(true);
		expect(isAccountChoiceExemptPath('/invite/token')).toBe(true);
		expect(isAccountChoiceExemptPath('/setup')).toBe(true);
		expect(isAccountChoiceExemptPath('/api/auth/invite/redeem')).toBe(true);
		expect(isAccountChoiceExemptPath('/reviews')).toBe(false);
		expect(isAccountChoiceExemptPath('/admin')).toBe(false);
		expect(isAccountChoiceExemptPath('/')).toBe(false);
	});
});

describe('destinationForAccount', () => {
	it('sends each role home when next is empty or the site root', () => {
		expect(destinationForAccount(author, '/')).toBe('/admin');
		expect(destinationForAccount(alice, undefined)).toBe('/reviews');
		expect(destinationForAccount(bob, '/choose')).toBe('/reviews');
	});

	it('keeps a shared document URL and rejects the other role’s home', () => {
		expect(destinationForAccount(alice, '/documents/intro')).toBe('/documents/intro');
		expect(destinationForAccount(author, '/reviews')).toBe('/admin');
		expect(destinationForAccount(alice, '/admin/reviewers')).toBe('/reviews');
	});
});

describe('safeNext and labels', () => {
	it('rejects protocol-relative and off-site next values', () => {
		expect(safeNext('//evil.example')).toBe('/');
		expect(safeNext('https://evil.example')).toBe('/');
		expect(safeNext('/reviews')).toBe('/reviews');
	});

	it('labels accounts with role so two people are distinguishable', () => {
		expect(accountLabel(alice)).toBe('Alice (reviewer)');
		expect(accountLabel(author)).toBe('Author (author)');
	});
});

describe('destinationAfterLeavingAccount', () => {
	it('stays on the current page when signing out a different account', () => {
		expect(
			destinationAfterLeavingAccount({
				wasCurrent: false,
				remaining: [alice],
				nextAccount: null,
				next: '/reviews'
			})
		).toBe('/reviews');
	});

	it('goes to login when the last account is signed out, or home/chooser otherwise', () => {
		expect(
			destinationAfterLeavingAccount({
				wasCurrent: true,
				remaining: [],
				nextAccount: null,
				next: '/reviews'
			})
		).toBe('/login');
		expect(
			destinationAfterLeavingAccount({
				wasCurrent: true,
				remaining: [bob],
				nextAccount: bob,
				next: '/admin'
			})
		).toBe('/reviews');
		expect(
			destinationAfterLeavingAccount({
				wasCurrent: true,
				remaining: [alice, bob],
				nextAccount: null,
				next: '/reviews'
			})
		).toBe('/choose');
	});
});
