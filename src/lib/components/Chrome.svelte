<script lang="ts">
	import { page } from '$app/state';
	import { accountLabel, asAccountRole, type DeviceAccount } from '$lib/accounts';
	import { clearTabAccountId, writeTabAccountId } from '$lib/tab-account';
	import NotificationBell from './NotificationBell.svelte';
	import {
		EDITOR_SURFACES,
		VIEW_MODES,
		editorSurfaceLabel,
		isAuthorOnlyViewMode,
		viewModeLabel,
		type EditorSurface,
		type ViewMode
	} from '$lib/view-mode';

	let {
		title,
		user,
		homeHref = '/',
		viewMode = undefined,
		onViewModeChange = undefined,
		editorSurface = undefined,
		onEditorSurfaceChange = undefined,
		status = undefined,
		downloadHref = undefined,
		onManageAccess = undefined,
		onOpenAnnotations = undefined,
		onOpenToc = undefined,
		onOpenComments = undefined
	}: {
		title: string;
		user?: { id?: string; name: string; role?: string } | null;
		homeHref?: string;
		viewMode?: ViewMode;
		onViewModeChange?: (mode: ViewMode) => void;
		editorSurface?: EditorSurface;
		onEditorSurfaceChange?: (surface: EditorSurface) => void;
		status?: string;
		downloadHref?: string;
		onManageAccess?: () => void;
		onOpenAnnotations?: () => void;
		onOpenToc?: () => void;
		onOpenComments?: () => void;
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
	const showSurfaceMenu = $derived(Boolean(editorSurface && onEditorSurfaceChange));
	const showManageAccess = $derived(canEdit && Boolean(onManageAccess));
	const showAnnotations = $derived(Boolean(onOpenAnnotations));

	const showMobileMenu = $derived(
		showModeMenu ||
			showSurfaceMenu ||
			Boolean(downloadHref) ||
			showManageAccess ||
			showAnnotations ||
			Boolean(user) ||
			Boolean(onOpenToc || onOpenComments)
	);

	let chromeEl = $state<HTMLElement | null>(null);

	function closeMenus() {
		if (!chromeEl) return;
		for (const details of chromeEl.querySelectorAll('details')) {
			details.open = false;
		}
	}

	function closeIfOutside(event: MouseEvent) {
		if (event.target instanceof Element && event.target.closest('.account-menu')) return;
		closeMenus();
	}

	function selectMode(mode: ViewMode) {
		if (isAuthorOnlyViewMode(mode) && !canEdit) return;
		onViewModeChange?.(mode);
		closeMenus();
	}

	function selectSurface(surface: EditorSurface) {
		onEditorSurfaceChange?.(surface);
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

{#snippet accountRows()}
	{#if user}
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
	{/if}
{/snippet}

<header class="chrome" bind:this={chromeEl}>
	<a class="chrome-title" href={homeHref} style="text-decoration:none;color:inherit">Glassine</a>
	{#if status !== undefined}
		<span class="muted chrome-status">{status}</span>
	{:else}
		<div class="chrome-spacer"></div>
	{/if}
	{#if showModeMenu || showSurfaceMenu || downloadHref || showManageAccess || showAnnotations || user}
	<div class="chrome-actions">
		{#if downloadHref}
			<a class="icon-btn" href={downloadHref} title="Download markdown" aria-label="Download markdown">
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path
						d="M8 2.4v8.2M5.1 8.3 8 11.2l2.9-2.9M3.2 13.6h9.6"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
		{/if}
		{#if showModeMenu && viewMode}
			<details class="account-menu" name="chrome-menu">
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
		{#if showSurfaceMenu && editorSurface}
			<details class="account-menu" name="chrome-menu">
				<summary id="surface-menu-toggle">{editorSurfaceLabel(editorSurface)}</summary>
				<div class="account-menu-panel">
					{#each EDITOR_SURFACES as surface (surface)}
						<button
							type="button"
							aria-current={editorSurface === surface ? 'true' : undefined}
							onclick={() => selectSurface(surface)}>{editorSurfaceLabel(surface)}</button
						>
					{/each}
				</div>
			</details>
		{/if}
		{#if showManageAccess}
			<button
				type="button"
				onclick={() => {
					closeMenus();
					onManageAccess?.();
				}}>Manage access</button
			>
		{/if}
		{#if showAnnotations}
			<button
				type="button"
				onclick={() => {
					closeMenus();
					onOpenAnnotations?.();
				}}>Annotations</button
			>
		{/if}
		{#if user}
			<NotificationBell onNavigate={closeMenus} />
		{/if}
		{#if user && menuAccounts.length}
			<details class="account-menu" name="chrome-menu">
				<summary id="account-menu-toggle">{currentLabel}</summary>
				<div class="account-menu-panel">
					{@render accountRows()}
				</div>
			</details>
		{/if}
	</div>
	{/if}
	{#if showMobileMenu}
		<details class="account-menu chrome-mobile-menu" name="chrome-menu">
			<summary class="chrome-hamburger" aria-label="Menu">
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path
						d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					/>
				</svg>
			</summary>
			<div class="chrome-mobile-panel">
				{#if onOpenToc || onOpenComments}
					{#if onOpenToc}
						<button
							type="button"
							onclick={() => {
								closeMenus();
								onOpenToc?.();
							}}>Contents</button
						>
					{/if}
					{#if onOpenComments}
						<button
							type="button"
							onclick={() => {
								closeMenus();
								onOpenComments?.();
							}}>Comments</button
						>
					{/if}
					<hr />
				{/if}
				{#if showModeMenu && viewMode}
					<div class="account-menu-heading">Mode</div>
					{#each VIEW_MODES as mode (mode)}
						<button
							type="button"
							disabled={isAuthorOnlyViewMode(mode) && !canEdit}
							title={isAuthorOnlyViewMode(mode) && !canEdit ? 'Authors only' : undefined}
							aria-current={viewMode === mode ? 'true' : undefined}
							onclick={() => selectMode(mode)}>{viewModeLabel(mode)}</button
						>
					{/each}
				{/if}
				{#if showSurfaceMenu && editorSurface}
					{#if showModeMenu && viewMode}<hr />{/if}
					<div class="account-menu-heading">Editor</div>
					{#each EDITOR_SURFACES as surface (surface)}
						<button
							type="button"
							aria-current={editorSurface === surface ? 'true' : undefined}
							onclick={() => selectSurface(surface)}>{editorSurfaceLabel(surface)}</button
						>
					{/each}
				{/if}
				{#if downloadHref || showManageAccess || showAnnotations}
					<hr />
					{#if downloadHref}
						<a class="account-menu-link" href={downloadHref} onclick={closeMenus}>Download markdown</a>
					{/if}
					{#if showManageAccess}
						<button
							type="button"
							onclick={() => {
								closeMenus();
								onManageAccess?.();
							}}>Manage access</button
						>
					{/if}
					{#if showAnnotations}
						<button
							type="button"
							onclick={() => {
								closeMenus();
								onOpenAnnotations?.();
							}}>Annotations</button
						>
					{/if}
				{/if}
				{#if user}
					<hr />
					<a class="account-menu-link" href="/notifications" onclick={closeMenus}>Notifications</a>
				{/if}
				{#if user && menuAccounts.length}
					<hr />
					<div class="account-menu-heading">Account</div>
					{@render accountRows()}
				{/if}
			</div>
		</details>
	{/if}
</header>
