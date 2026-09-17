<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';

	let { form } = $props();
</script>

<Chrome title="Open reviews" />
<main class="page stack">
	<h1>Open my reviews</h1>
	<p class="muted">This confirms the invite in a POST so a mail scanner cannot mint a session.</p>
	<form method="POST">
		<button class="primary" type="submit">Continue</button>
	</form>
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
</main>
