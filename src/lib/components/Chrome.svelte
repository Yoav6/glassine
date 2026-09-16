<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	let {
		title,
		user,
		homeHref = '/'
	}: {
		title: string;
		user?: { name: string; role?: string } | null;
		homeHref?: string;
	} = $props();

	function toggleTheme() {
		const html = document.documentElement;
		const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
		html.setAttribute('data-theme', next);
		localStorage.setItem('glassine-theme', next);
	}

	async function signOut() {
		await authClient.signOut();
		await goto('/login');
	}
</script>

<header class="chrome">
	<a class="chrome-title" href={homeHref} style="text-decoration:none;color:inherit">Glassine</a>
	<span class="muted">{title}</span>
	<div class="chrome-spacer"></div>
	<button type="button" onclick={toggleTheme}>Theme</button>
	{#if user}
		<span class="muted">{user.name}</span>
		<button type="button" onclick={signOut}>Sign out</button>
	{/if}
</header>
