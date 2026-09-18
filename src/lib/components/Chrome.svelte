<script lang="ts">
	import { page } from '$app/state';
	import { accountLabel, asAccountRole, type DeviceAccount } from '$lib/accounts';
	import { clearTabAccountId, writeTabAccountId } from '$lib/tab-account';
	import {
		VIEW_MODES,
		isAuthorOnlyViewMode,
		viewModeLabel,
		type ViewMode
	} from '$lib/view-mode';

	let {
		title,
		user,
		homeHref = '/',
		viewMode = undefined,
		onViewModeChange = undefined
	}: {
		title: string;
		user?: { id?: string; name: string; role?: string } | null;
		homeHref?: string;
		viewMode?: ViewMode;
		onViewModeChange?: (mode: ViewMode) => void;
	} = $props();

	const accounts = $derived((page.data.deviceAccounts ?? []) as DeviceAccount[]);
	const menuAccounts = $derived(
		accounts.length
			? accounts
			: user?.id
				? [
						{
							id: user.id,
							name: user.name,
							role: asAccountRole(user.role)
						}
					]
				: []
	);
	const here = $derived(`${page.url.pathname}${page.url.search}`);
	const switchNext = $derived(page.url.pathname.startsWith('/documents/') ? here : '');
	const currentLabel = $derived(
		user
			? accountLabel({
					id: user.id ?? '',
					name: user.name,
					role: asAccountRole(user.role)
				})
			: ''
	);
	const canEdit = $derived(asAccountRole(user?.role) === 'author');
	const showModeMenu = $derived(Boolean(viewMode && onViewModeChange));

	let actionsEl = $state<HTMLDivElement | null>(null);

	function closeMenus() {
		if (!actionsEl) return;
		for (const details of actionsEl.querySelectorAll('details')) {
			details.open = false;
		}
	}

	function closeIfOutside(event: MouseEvent) {
		if (!actionsEl) return;
		if (event.target instanceof Node && actionsEl.contains(event.target)) return;
		closeMenus();
	}

	function selectMode(mode: ViewMode) {
		if (isAuthorOnlyViewMode(mode) && !canEdit) return;
		onViewModeChange?.(mode);
		closeMenus();
	}
</script>

<svelte:window
	onclick={closeIfOutside}
	onkeydown={(event) => {
		if (event.key === 'Escape') closeMenus();
	}}
/>

<svelte:head>
	<title>{title} · Glassine</title>
</svelte:head>

<header class="chrome">
	<a class="chrome-title" href={homeHref} style="text-decoration:none;color:inherit">Glassine</a>
	<div class="chrome-spacer"></div>
	{#if showModeMenu || (user && menuAccounts.length)}
	<div class="chrome-actions" bind:this={actionsEl}>
		{#if showModeMenu && viewMode}
			<details class="account-menu">
				<summary id="mode-menu-toggle">{viewModeLabel(viewMode)}</summary>
				<div class="account-menu-panel">
					{#each VIEW_MODES as mode (mode)}
						<button
							type="button"
							disabled={isAuthorOnlyViewMode(mode) && !canEdit}
							title={isAuthorOnlyViewMode(mode) && !canEdit ? 'Authors only' : undefined}
							aria-current={viewMode === mode ? 'true' : undefined}
							onclick={() => selectMode(mode)}>{viewModeLabel(mode)}</button
						>
					{/each}
				</div>
			</details>
		{/if}
		{#if user && menuAccounts.length}
			<details class="account-menu">
				<summary id="account-menu-toggle">{currentLabel}</summary>
				<div class="account-menu-panel">
					{#each menuAccounts as account (account.id)}
						<div class="account-menu-row">
							{#if account.id === user.id}
								<span class="account-menu-current">{accountLabel(account)}</span>
							{:else}
								<form method="POST" action="/choose?/activate">
									<input type="hidden" name="userId" value={account.id} />
									<input type="hidden" name="next" value={switchNext} />
									<button type="submit" onclick={() => writeTabAccountId(account.id)}
										>{accountLabel(account)}</button
									>
								</form>
							{/if}
							<form
								method="POST"
								action="/choose?/leave"
								onsubmit={() => {
									if (account.id === user.id) clearTabAccountId();
								}}
							>
								<input type="hidden" name="userId" value={account.id} />
								<input type="hidden" name="next" value={here} />
								<button type="submit" class="sign-out" aria-label="Sign out {accountLabel(account)}"
									>Sign out</button
								>
							</form>
						</div>
					{/each}
				</div>
			</details>
		{/if}
	</div>
	{/if}
</header>
