import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { TAB_BIND_COOKIE } from '../../lib/accounts';

function createReviewer(name: string, email: string): string {
	const out = execFileSync(
		process.execPath,
		['node_modules/tsx/dist/cli.mjs', 'scripts/cli.ts', 'create-reviewer', name, email],
		{ encoding: 'utf8' }
	);
	const match = out.match(/\/invite\/[A-Za-z0-9_-]+/);
	if (!match) throw new Error(`CLI did not print an invite URL:\n${out}`);
	return match[0];
}

async function redeem(page: Page, invitePath: string) {
	await page.goto(invitePath);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page).toHaveURL(/\/(reviews|articles\/)/);
	if (new URL(page.url()).pathname === '/reviews') {
		await expect(page.getByRole('heading', { name: 'Articles you can review' })).toBeVisible();
	}
}

function accountToggle(page: Page) {
	return page.locator('#account-menu-toggle');
}

async function openAccountMenu(page: Page) {
	if (await page.locator('.account-menu-panel').isVisible()) return;
	await accountToggle(page).click();
	await expect(page.locator('.account-menu-panel')).toBeVisible();
}

test('account chooser with no device sessions goes to sign in', async ({ page }) => {
	await page.goto('/choose');
	await expect(page).toHaveURL(/\/login$/);
});

test('a single reviewer session does not show the account chooser', async ({ page, context }) => {
	const stamp = Date.now();
	const invite = createReviewer(`Solo-${stamp}`, `solo-${stamp}@example.com`);
	await redeem(page, invite);
	await expect(accountToggle(page)).toHaveText(`Solo-${stamp} (reviewer)`);
	await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
	await openAccountMenu(page);
	await expect(page.getByRole('button', { name: `Sign out Solo-${stamp} (reviewer)` })).toBeVisible();

	const nextTab = await context.newPage();
	await nextTab.goto('/reviews');
	await expect(nextTab.getByRole('heading', { name: 'Articles you can review' })).toBeVisible();
	await expect(nextTab.getByRole('heading', { name: 'Choose an account' })).toHaveCount(0);
	await expect(accountToggle(nextTab)).toHaveText(`Solo-${stamp} (reviewer)`);
	await nextTab.close();
});

test('two reviewer sessions on one device require a fresh choice in a new tab', async ({
	page,
	context
}) => {
	const stamp = Date.now();
	const aliceInvite = createReviewer(`Alice-${stamp}`, `alice-${stamp}@example.com`);
	const bobInvite = createReviewer(`Bob-${stamp}`, `bob-${stamp}@example.com`);

	await redeem(page, aliceInvite);
	await redeem(page, bobInvite);
	await expect(accountToggle(page)).toBeVisible();

	await page.reload();
	await expect(accountToggle(page)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Choose an account' })).toHaveCount(0);

	await context.clearCookies({ name: TAB_BIND_COOKIE });
	const secondTab = await context.newPage();
	await secondTab.goto('/');
	await expect(secondTab).toHaveURL(/\/choose/);
	await expect(secondTab.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
	await expect(secondTab.getByRole('button', { name: `Alice-${stamp} (reviewer)` })).toBeVisible();
	await expect(secondTab.getByRole('button', { name: `Bob-${stamp} (reviewer)` })).toBeVisible();

	await secondTab.getByRole('button', { name: `Alice-${stamp} (reviewer)` }).click();
	await expect(secondTab).toHaveURL(/\/reviews/);
	await expect(accountToggle(secondTab)).toHaveText(`Alice-${stamp} (reviewer)`);

	await openAccountMenu(secondTab);
	await secondTab.getByRole('button', { name: `Bob-${stamp} (reviewer)`, exact: true }).click();
	await expect(accountToggle(secondTab)).toHaveText(`Bob-${stamp} (reviewer)`);

	await context.clearCookies({ name: TAB_BIND_COOKIE });
	const thirdTab = await context.newPage();
	await thirdTab.goto('/reviews');
	await expect(thirdTab).toHaveURL(/\/choose/);
	await expect(thirdTab.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
	await secondTab.close();
	await thirdTab.close();
});

test('opening a tab from an existing tab also asks which account to use', async ({ page, context }) => {
	const stamp = Date.now();
	const aliceInvite = createReviewer(`DupAlice-${stamp}`, `dup-alice-${stamp}@example.com`);
	const bobInvite = createReviewer(`DupBob-${stamp}`, `dup-bob-${stamp}@example.com`);

	await redeem(page, aliceInvite);
	await redeem(page, bobInvite);
	await expect(accountToggle(page)).toBeVisible();
	await expect(page).toHaveURL(/\/reviews/);

	await page.waitForFunction(async () => {
		if (!navigator.locks?.query) return true;
		const state = await navigator.locks.query();
		return (state.held ?? []).some((lock) => lock.name?.startsWith('glassine_tab_'));
	});

	const popupPromise = context.waitForEvent('page');
	await page.evaluate(() => {
		window.open('/reviews', '_blank');
	});
	const opened = await popupPromise;
	await expect(opened).toHaveURL(/\/choose/);
	await expect(opened.getByRole('heading', { name: 'Choose an account' })).toBeVisible();
	await expect(accountToggle(page)).toBeVisible();
	await opened.close();
});

test('signing out one account from the menu leaves the other signed in', async ({ page }) => {
	const stamp = Date.now();
	const aliceInvite = createReviewer(`Keep-${stamp}`, `keep-${stamp}@example.com`);
	const bobInvite = createReviewer(`Drop-${stamp}`, `drop-${stamp}@example.com`);
	await redeem(page, aliceInvite);
	await redeem(page, bobInvite);
	await expect(accountToggle(page)).toBeVisible();

	await openAccountMenu(page);
	await page.getByRole('button', { name: `Sign out Keep-${stamp} (reviewer)` }).click();
	await expect(accountToggle(page)).toHaveText(`Drop-${stamp} (reviewer)`);
	await expect(page.getByRole('heading', { name: 'Choose an account' })).toHaveCount(0);

	await openAccountMenu(page);
	await expect(page.getByRole('button', { name: `Sign out Drop-${stamp} (reviewer)` })).toBeVisible();
	await expect(page.getByRole('button', { name: `Sign out Keep-${stamp} (reviewer)` })).toHaveCount(0);
	await page.getByRole('button', { name: `Sign out Drop-${stamp} (reviewer)` }).click();
	expect(new URL(page.url()).pathname).toBe('/login');
});
