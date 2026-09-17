<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { isAccountChoiceExemptPath } from '$lib/accounts';
	import { readTabAccountId, writeTabAccountId } from '$lib/tab-account';

	let { children } = $props();

	$effect(() => {
		const user = page.data.user as { id?: string } | null | undefined;
		const accounts = page.data.deviceAccounts ?? [];
		if (!user?.id || accounts.length < 2) return;
		if (isAccountChoiceExemptPath(page.url.pathname)) return;
		if (
			typeof document !== 'undefined' &&
			document.documentElement.hasAttribute('data-glassine-tab-check')
		) {
			return;
		}
		if (!readTabAccountId()) return;
		writeTabAccountId(user.id);
	});
</script>

<svelte:head>
	<title>Glassine</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
