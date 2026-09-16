<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let copied = $state('');

	$effect(() => {
		if (form && 'invite' in form && form.invite) copied = String(form.invite);
	});

	async function copyText(text: string) {
		copied = text;
		await navigator.clipboard.writeText(text);
	}
</script>

<Chrome title="Reviewers" user={data.user} homeHref="/admin" />
<main class="page stack" style="max-width:56rem">
	<nav class="row">
		<a href="/admin">Articles</a>
		<a href="/admin/reviewers">Reviewers</a>
	</nav>
	<h1>Reviewer directory</h1>
	<p class="muted">People you add once. Grants are per article. Copying an invite replaces the previous URL.</p>

	<form method="POST" action="?/create" use:enhance class="stack">
		<div class="row">
			<input name="name" placeholder="Display name" required />
			<input name="email" type="email" placeholder="email@example.com" required />
			<select name="highlightColor">
				{#each data.colors as color}
					<option value={color}>{color}</option>
				{/each}
			</select>
			<button class="primary" type="submit">Add reviewer</button>
		</div>
	</form>
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	{#if copied}
		<p class="muted">Invite: <code>{copied}</code> <button type="button" onclick={() => copyText(copied)}>Copy</button></p>
	{/if}

	{#each data.reviewers as reviewer}
		<section class="card stack">
			<h2>
				<span class="swatch" style="background:{reviewer.highlightColor}"></span>
				{reviewer.name}
				<span class="muted"> · {reviewer.email}</span>
			</h2>
			<form method="POST" action="?/copy" use:enhance={() => {
				return async ({ result, update }) => {
					await update();
					if (result.type === 'success' && result.data && 'invite' in result.data) {
						copied = String(result.data.invite);
						await navigator.clipboard.writeText(copied);
					}
				};
			}} class="row">
				<input type="hidden" name="reviewerId" value={reviewer.id} />
				<select name="slug">
					<option value="">Personal login</option>
					{#each data.docs as doc}
						<option value={doc.slug}>{doc.title}</option>
					{/each}
				</select>
				<button type="submit">Copy invite</button>
			</form>
			{#each data.docs as doc}
				{@const g = data.grants.find((x) => x.reviewerId === reviewer.id && x.documentId === doc.id)}
				<div class="row">
					<strong>{doc.title}</strong>
					{#if g}
						<form method="POST" action="?/grant" use:enhance class="row">
							<input type="hidden" name="reviewerId" value={reviewer.id} />
							<input type="hidden" name="documentId" value={doc.id} />
							<select name="visibilityScope" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
								<option value="own" selected={g.visibilityScope === 'own'}>Own only</option>
								<option value="all" selected={g.visibilityScope === 'all'}>All reviewers</option>
							</select>
						</form>
						<form method="POST" action="?/revoke" use:enhance>
							<input type="hidden" name="reviewerId" value={reviewer.id} />
							<input type="hidden" name="documentId" value={doc.id} />
							<button type="submit">Revoke</button>
						</form>
					{:else}
						<form method="POST" action="?/grant" use:enhance>
							<input type="hidden" name="reviewerId" value={reviewer.id} />
							<input type="hidden" name="documentId" value={doc.id} />
							<input type="hidden" name="visibilityScope" value="own" />
							<button type="submit">Grant</button>
						</form>
					{/if}
				</div>
			{/each}
		</section>
	{/each}
</main>
