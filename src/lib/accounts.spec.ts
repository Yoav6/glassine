import { describe, expect, it } from 'vitest';
import {
	accountLabel,
	destinationAfterLeavingAccount,
	destinationForAccount,
	isAccountChoiceExempt,
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
				pathname: '/'
			})
		).toBe(true);
	});

	it('does not prompt after this tab has chosen, or with a single account', () => {
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: true,
				tabAccountId: 'alice',
				pathname: '/'
			})
		).toBe(false);
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: false,
				tabAccountId: null,
				pathname: '/'
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
				pathname: '/',
				choiceHeldByAnotherTab: true
			})
		).toBe(true);
		expect(
			shouldForceAccountChooser({
				hasMultipleAccounts: true,
				tabAccountId: 'alice',
				pathname: '/',
				choiceHeldByAnotherTab: true,
				isReload: true
			})
		).toBe(false);
	});
});

describe('isAccountChoiceExemptPath', () => {
	it('allows sign-in, setup, and the chooser itself', () => {
		expect(isAccountChoiceExemptPath('/choose')).toBe(true);
		expect(isAccountChoiceExemptPath('/login')).toBe(true);
		expect(isAccountChoiceExemptPath('/setup')).toBe(true);
		expect(isAccountChoiceExemptPath('/api/auth/invite/redeem')).toBe(true);
		expect(isAccountChoiceExemptPath('/admin')).toBe(false);
		expect(isAccountChoiceExemptPath('/')).toBe(false);
	});
});

describe('isAccountChoiceExempt', () => {
	it('allows invite landing URLs with a token query param', () => {
		expect(isAccountChoiceExempt(new URL('http://localhost/?token=abc'))).toBe(true);
		expect(isAccountChoiceExempt(new URL('http://localhost/documents/intro?token=abc'))).toBe(
			true
		);
		expect(isAccountChoiceExempt(new URL('http://localhost/'))).toBe(false);
		expect(isAccountChoiceExempt(new URL('http://localhost/documents/intro'))).toBe(false);
	});
});

describe('destinationForAccount', () => {
	it('sends each role home when next is empty or the site root', () => {
		expect(destinationForAccount(author, '/')).toBe('/admin');
		expect(destinationForAccount(alice, undefined)).toBe('/');
		expect(destinationForAccount(bob, '/choose')).toBe('/');
	});

	it('keeps a shared document URL and rejects the other role’s home', () => {
		expect(destinationForAccount(alice, '/documents/intro')).toBe('/documents/intro');
		expect(destinationForAccount(alice, '/admin/reviewers')).toBe('/');
	});
});

describe('safeNext and labels', () => {
	it('rejects protocol-relative and off-site next values', () => {
		expect(safeNext('//evil.example')).toBe('/');
		expect(safeNext('https://evil.example')).toBe('/');
		expect(safeNext('/documents/intro')).toBe('/documents/intro');
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
				next: '/documents/intro'
			})
		).toBe('/documents/intro');
	});

	it('goes to login when the last account is signed out, or home/chooser otherwise', () => {
		expect(
			destinationAfterLeavingAccount({
				wasCurrent: true,
				remaining: [],
				nextAccount: null,
				next: '/'
			})
		).toBe('/login');
		expect(
			destinationAfterLeavingAccount({
				wasCurrent: true,
				remaining: [bob],
				nextAccount: bob,
				next: '/admin'
			})
		).toBe('/');
		expect(
			destinationAfterLeavingAccount({
				wasCurrent: true,
				remaining: [alice, bob],
				nextAccount: null,
				next: '/'
			})
		).toBe('/choose');
	});
});
