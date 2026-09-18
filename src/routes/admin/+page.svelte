<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let formEl: HTMLFormElement;
	let fileInput: HTMLInputElement;

	function uploadSelected() {
		if (fileInput.files?.length) formEl.requestSubmit();
	}
</script>

<Chrome title="Documents" user={data.user} homeHref="/admin" />
<main class="page stack">
	<AdminNav current="documents" />
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	{#if form?.uploaded}<p class="muted">Uploaded <a href="/documents/{form.uploaded}">{form.uploaded}</a></p>{/if}
	<form
		bind:this={formEl}
		class="upload-form"
		method="POST"
		action="?/upload"
		enctype="multipart/form-data"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
				fileInput.value = '';
			};
		}}
	>
		<input
			bind:this={fileInput}
			class="upload-input"
			id="document-upload"
			type="file"
			name="file"
			accept=".md,text/markdown"
			required
			onchange={uploadSelected}
		/>
		<label class="icon-btn" for="document-upload" title="Upload document">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="M8 3.2v9.6M3.2 8h9.6"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
				/>
			</svg>
			<span class="visually-hidden">Upload document</span>
		</label>
	</form>
	<table class="data">
		<thead>
			<tr>
				<th>Title</th>
				<th title="Unresolved comments and suggestions">Open</th>
			</tr>
		</thead>
		<tbody>
			{#each data.docs as doc}
				<tr>
					<td><a href="/documents/{doc.slug}">{doc.title}</a></td>
					<td>{doc.open}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</main>

<style>
	.upload-form {
		display: flex;
		justify-content: flex-end;
	}

	.upload-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
