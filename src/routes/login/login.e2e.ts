import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

function expectLogin(page: { url(): string }) {
	expect(new URL(page.url()).pathname).toBe('/login');
}

test('author login page is a continuous sign-in, not a boxed editor', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Author sign in' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();
});

test('unauthenticated admin and reviews send the author to sign in', async ({ page }) => {
	await page.goto('/admin');
	expectLogin(page);
	await expect(page.getByRole('heading', { name: 'Author sign in' })).toBeVisible();
	await page.goto('/admin/settings');
	expectLogin(page);
	await page.goto('/reviews');
	expectLogin(page);
	await page.goto('/setup');
	expectLogin(page);
});

test('admin shows author login even when this browser has a reviewer session', async ({ page }) => {
	const stamp = Date.now();
	const out = execFileSync(
		process.execPath,
		[
			'node_modules/tsx/dist/cli.mjs',
			'scripts/cli.ts',
			'create-reviewer',
			`AdminGate-${stamp}`,
			`admin-gate-${stamp}@example.com`
		],
		{ encoding: 'utf8' }
	);
	const invite = out.match(/\/invite\/[A-Za-z0-9_-]+/);
	if (!invite) throw new Error(`CLI did not print an invite URL:\n${out}`);
	await page.goto(invite[0]);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Documents you can review' })).toBeVisible();

	await page.goto('/admin');
	expectLogin(page);
	await expect(page.getByRole('heading', { name: 'Author sign in' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();
	await expect(page.getByRole('heading', { name: '500' })).toHaveCount(0);
});

test('invite GET does not mint a session', async ({ page }) => {
	await page.goto('/invite/not-a-real-token');
	await expect(page.getByRole('heading', { name: 'Open my reviews' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
	await page.goto('/reviews');
	expectLogin(page);
});
