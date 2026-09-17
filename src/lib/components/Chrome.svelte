<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { toggleTheme } from '$lib/theme';

	let {
		title,
		user,
		homeHref = '/'
	}: {
		title: string;
		user?: { name: string; role?: string } | null;
		homeHref?: string;
	} = $props();

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
	{#if user?.role === 'author'}
		<a href="/admin/settings">Settings</a>
	{/if}
	{#if user}
		<span class="muted">{user.name}</span>
		<button type="button" onclick={signOut}>Sign out</button>
	{/if}
</header>
