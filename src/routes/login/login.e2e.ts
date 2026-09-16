import { expect, test } from '@playwright/test';

test('author login page is a continuous sign-in, not a boxed editor', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('heading', { name: 'Author sign in' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();
});

test('unauthenticated admin and reviews send the author to sign in', async ({ page }) => {
	await page.goto('/admin');
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/reviews');
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/setup');
	await expect(page).toHaveURL(/\/login$/);
});

test('invite GET does not mint a session', async ({ page }) => {
	await page.goto('/invite/not-a-real-token');
	await expect(page.getByRole('heading', { name: 'Open my reviews' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
	await page.goto('/reviews');
	await expect(page).toHaveURL(/\/login$/);
});
