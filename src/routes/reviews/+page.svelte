<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';

	let { data } = $props();
</script>

<Chrome title="Your reviews" user={data.user} />
<main class="page stack">
	<h1>Documents you can review</h1>
	{#if data.docs.length === 0}
		<p class="muted">No documents yet. Ask the author to grant you access.</p>
	{:else}
		<ul>
			{#each data.docs as doc}
				<li><a href="/documents/{doc.slug}">{doc.title}</a></li>
			{/each}
		</ul>
	{/if}
</main>
