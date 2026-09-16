<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<Chrome title="Articles" user={data.user} homeHref="/admin" />
<main class="page stack">
	<nav class="row">
		<a href="/admin">Articles</a>
		<a href="/admin/reviewers">Reviewers</a>
	</nav>
	<h1>Articles</h1>
	<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance class="row">
		<input type="file" name="file" accept=".md,text/markdown" required />
		<button class="primary" type="submit">Upload</button>
	</form>
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	{#if form?.uploaded}<p class="muted">Uploaded <a href="/articles/{form.uploaded}">{form.uploaded}</a></p>{/if}
	<table class="data">
		<thead>
			<tr>
				<th>Title</th>
				<th>Open</th>
				<th>Outdated</th>
			</tr>
		</thead>
		<tbody>
			{#each data.docs as doc}
				<tr>
					<td><a href="/articles/{doc.slug}">{doc.title}</a></td>
					<td>{doc.open}</td>
					<td>{doc.detached}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</main>
