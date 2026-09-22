import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

function parseInvitePath(out: string): string {
	const match = out.match(/\?token=([A-Za-z0-9_-]+)/);
	if (!match) throw new Error(`CLI did not print an invite URL:\n${out}`);
	return `/?token=${match[1]}`;
}

function createReviewer(label: string): { invite: string; email: string } {
	const stamp = Date.now();
	const email = `${label.toLowerCase()}-${stamp}@example.com`;
	const invite = parseInvitePath(
		execFileSync(
			process.execPath,
			['node_modules/tsx/dist/cli.mjs', 'scripts/cli.ts', 'create-reviewer', `${label}-${stamp}`, email],
			{ encoding: 'utf8' }
		)
	);
	return { invite, email };
}

/** Runs a one-off script against the same DB the dev server under test uses. */
function runInApp(script: string): string {
	return execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '-e', script], {
		encoding: 'utf8'
	});
}

/**
 * A document with a title long enough to exercise the mobile notification
 * panel's overflow handling, and a handful of unread notifications on it for
 * the reviewer at this email.
 */
function seedLongTitleNotifications(reviewerEmail: string): void {
	runInApp(`
		import { eq } from 'drizzle-orm';
		import { db } from './src/lib/server/db';
		import { document, notification, user } from './src/lib/server/db/schema';
		import { newId } from './src/lib/server/crypto';

		const now = new Date();
		const reviewer = db.select().from(user).where(eq(user.email, ${JSON.stringify(reviewerEmail)})).get()!;
		const authorId = db.select().from(user).where(eq(user.role, 'author')).get()!.id;
		const docId = newId();
		db.insert(document).values({
			id: docId,
			slug: 'notif-overflow-' + Date.now(),
			title: 'A Very Long Document Title That Should Wrap Instead Of Overflowing The Panel',
			relativePath: 'notif-overflow.md',
			baseVersion: 1,
			updatedAt: now,
			createdAt: now
		}).run();
		for (const kind of ['comment', 'reply', 'comment']) {
			db.insert(notification).values({
				id: newId(),
				userId: reviewer.id,
				actorId: authorId,
				kind,
				documentId: docId,
				annotationId: null,
				threadId: null,
				createdAt: now,
				readAt: null,
				emailStatus: null,
				emailedAt: null
			}).run();
		}
	`);
}

test('notifications need a session', async ({ page }) => {
	await page.goto('/notifications');
	expect(new URL(page.url()).pathname).toBe('/login');
});

test('a signed-in reviewer gets a bell and an empty notifications page', async ({ page }) => {
	await page.goto(createReviewer('Bell').invite);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Documents you can review' })).toBeVisible();

	// The bell is in the chrome, with no unread badge for a brand-new reviewer.
	// There are two copies in the DOM (one for the mobile layout, hidden here
	// at desktop width via CSS) sharing the same label, so scope to the one
	// that's actually shown at this viewport.
	const bell = page.locator('.chrome-actions').getByLabel('Notifications', { exact: true });
	await expect(bell).toBeVisible();
	await bell.click();
	await expect(page.locator('.chrome-actions').getByText('Nothing yet.')).toBeVisible();

	await page.goto('/notifications');
	await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
	await expect(
		page.getByText('Comments, suggestions and replies show up here.')
	).toBeVisible();
});

test('on mobile, the bell sits next to the hamburger instead of inside it', async ({ page }) => {
	// iPhone SE width: narrow enough that the bell (left of the hamburger, not
	// flush against the true right edge) previously made the dropdown, anchored
	// with `right: 0` relative to the bell itself, overflow off the left of
	// the screen.
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto(createReviewer('MobileBell').invite);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Documents you can review' })).toBeVisible();

	// Visible and clickable without opening the hamburger menu first. Not
	// `getByLabel(..., { exact: true })`: with unread notifications the label
	// becomes "Notifications, N unread", so this matches by class instead.
	const mobileBell = page.locator('.chrome-bell-mobile .notif-summary');
	await expect(mobileBell).toBeVisible();
	await mobileBell.click();
	const panel = page.locator('.chrome-bell-mobile .notif-panel');
	await expect(panel.getByText('Nothing yet.')).toBeVisible();

	const box = await panel.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(375);

	await mobileBell.click(); // close, so it doesn't overlap the hamburger check below

	// The desktop copy exists in the DOM (CSS-hidden here) but is not what a
	// person on this viewport would reach.
	await expect(page.locator('.chrome-actions')).toBeHidden();

	// The hamburger panel no longer carries its own "Notifications" link —
	// the live bell replaced it. (`<summary>` doesn't map to an ARIA button
	// role, so this is a direct locator, matching how choose.e2e.ts opens
	// the account menu.)
	await page.locator('.chrome-hamburger').click();
	await expect(page.getByRole('link', { name: 'Notifications' })).toHaveCount(0);
});

test('on mobile, a long document title does not push notification rows past the panel', async ({
	page
}) => {
	// The base `.notif-panel` rule sets `min-width: max-content` so the
	// desktop panel (free to grow left of its `right: 0` anchor) never wraps
	// a short line. On mobile the panel is pinned on both edges instead, so
	// that same min-width — inherited unless explicitly reset — forced it
	// past its own `left`/`right` bounds for any content wider than the gap
	// between them: a long document title, or several rows at once.
	await page.setViewportSize({ width: 375, height: 667 });
	const reviewer = createReviewer('MobileOverflow');
	seedLongTitleNotifications(reviewer.email);

	await page.goto(reviewer.invite);
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Documents you can review' })).toBeVisible();

	// `seedLongTitleNotifications` writes through a separate process's own
	// connection to the same SQLite file; poll until the running server's own
	// connection actually reflects it, rather than assume the UI is ready the
	// instant the writer process returned.
	await expect
		.poll(
			async () =>
				page.evaluate(() => fetch('/api/notifications').then((r) => r.json().then((b) => b.unread)))
		)
		.toBeGreaterThan(0);

	const mobileBell = page.locator('.chrome-bell-mobile .notif-summary');
	await expect(mobileBell).toBeVisible();
	await mobileBell.click();
	const panel = page.locator('.chrome-bell-mobile .notif-panel');
	await expect(panel.getByText('A Very Long Document Title', { exact: false }).first()).toBeVisible();

	const panelBox = (await panel.boundingBox())!;
	expect(panelBox.x).toBeGreaterThanOrEqual(0);
	expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(375);

	const rows = page.locator('.chrome-bell-mobile .notif-list a');
	const rowCount = await rows.count();
	expect(rowCount).toBeGreaterThan(0);
	for (let i = 0; i < rowCount; i += 1) {
		const rowBox = (await rows.nth(i).boundingBox())!;
		expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 0.5);
	}
});
