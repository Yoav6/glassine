<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';

	let {
		title,
		action = undefined,
		form
	}: {
		title: string;
		action?: string;
		form?: { message?: string } | null;
	} = $props();
</script>

<Chrome {title} />
<main class="page stack">
	<h1>{title}</h1>
	<p class="muted">This confirms the invite in a POST so a mail scanner cannot mint a session.</p>
	<form method="POST" {action}>
		<button class="primary" type="submit">Continue</button>
	</form>
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
</main>
