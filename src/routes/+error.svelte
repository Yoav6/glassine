<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';

	let { error, status }: { error: App.Error; status: number } = $props();
</script>

<Chrome title="Error" />
<main class="page stack">
	<h1>{status}</h1>
	<p class="muted">{error.message}</p>
	<a href="/login">Sign in</a>
</main>
