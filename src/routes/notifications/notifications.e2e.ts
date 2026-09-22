import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

function parseInvitePath(out: string): string {
	const match = out.match(/\?token=([A-Za-z0-9_-]+)/);
	if (!match) throw new Error(`CLI did not print an invite URL:\n${out}`);
	return `/?token=${match[1]}`;
}

function createReviewer(label: string): string {
	const stamp = Date.now();
	return parseInvitePath(
		execFileSync(
			process.execPath,
			[
				'node_modules/tsx/dist/cli.mjs',
				'scripts/cli.ts',
				'create-reviewer',
				`${label}-${stamp}`,
				`${label.toLowerCase()}-${stamp}@example.com`
			],
			{ encoding: 'utf8' }
		)
	);
}

test('notifications need a session', async ({ page }) => {
	await page.goto('/notifications');
	expect(new URL(page.url()).pathname).toBe('/login');
});

test('a signed-in reviewer gets a bell and an empty notifications page', async ({ page }) => {
	await page.goto(createReviewer('Bell'));
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Documents you can review' })).toBeVisible();

	// The bell is in the chrome, with no unread badge for a brand-new reviewer.
	const bell = page.getByLabel('Notifications', { exact: true });
	await expect(bell).toBeVisible();
	await bell.click();
	await expect(page.getByText('Nothing yet.')).toBeVisible();

	await page.goto('/notifications');
	await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
	await expect(
		page.getByText('Comments, suggestions and replies show up here.')
	).toBeVisible();
});
