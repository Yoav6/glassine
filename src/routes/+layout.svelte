<script lang="ts">
	import '@fontsource-variable/inter';
	import '@fontsource-variable/inter/wght-italic.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { isAccountChoiceExempt } from '$lib/accounts';
	import { readTabAccountId, writeTabAccountId } from '$lib/tab-account';

	let { children } = $props();

	$effect(() => {
		const user = page.data.user as { id?: string } | null | undefined;
		const accounts = page.data.deviceAccounts ?? [];
		if (!user?.id || accounts.length < 2) return;
		if (isAccountChoiceExempt(page.url)) return;
		if (
			typeof document !== 'undefined' &&
			document.documentElement.hasAttribute('data-glassine-tab-check')
		) {
			return;
		}
		if (!readTabAccountId()) return;
		writeTabAccountId(user.id);
	});

	$effect(() => {
		function closeOnBackdrop(event: MouseEvent) {
			const target = event.target;
			if (target instanceof HTMLDialogElement && target.open) target.close();
		}
		document.addEventListener('click', closeOnBackdrop);
		return () => document.removeEventListener('click', closeOnBackdrop);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
