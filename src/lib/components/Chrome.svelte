<script lang="ts">
	import { page } from '$app/state';
	import { accountLabel, asAccountRole, type DeviceAccount } from '$lib/accounts';
	import { clearTabAccountId, writeTabAccountId } from '$lib/tab-account';

	let {
		title,
		user,
		homeHref = '/'
	}: {
		title: string;
		user?: { id?: string; name: string; role?: string } | null;
		homeHref?: string;
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
	const switchNext = $derived(page.url.pathname.startsWith('/articles/') ? here : '');
	const currentLabel = $derived(
		user
			? accountLabel({
					id: user.id ?? '',
					name: user.name,
					role: asAccountRole(user.role)
				})
			: ''
	);

	let menuEl = $state<HTMLDetailsElement | null>(null);

	function closeIfOutside(event: MouseEvent) {
		if (!menuEl?.open) return;
		if (event.target instanceof Node && menuEl.contains(event.target)) return;
		menuEl.open = false;
	}
</script>

<svelte:window
	onclick={closeIfOutside}
	onkeydown={(event) => {
		if (event.key === 'Escape' && menuEl) menuEl.open = false;
	}}
/>

<header class="chrome">
	<a class="chrome-title" href={homeHref} style="text-decoration:none;color:inherit">Glassine</a>
	<span class="muted">{title}</span>
	<div class="chrome-spacer"></div>
	{#if user?.role === 'author'}
		<a href="/admin/settings">Settings</a>
	{/if}
	{#if user && menuAccounts.length}
		<details class="account-menu" bind:this={menuEl}>
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
</header>
