<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import AdminFileTable, { type AdminFileRow } from '$lib/components/AdminFileTable.svelte';
	import FileNameDialog from '$lib/components/FileNameDialog.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let formEl: HTMLFormElement;
	let fileInput: HTMLInputElement;
	let createDialog: HTMLDialogElement | undefined = $state();
	let createNameInput: HTMLInputElement | undefined = $state();
	let addMenu: HTMLDetailsElement;
	let createName = $state('');
	let createError = $state('');

	const rows = $derived(
		data.docs.map(
			(doc): AdminFileRow => ({
				key: doc.slug,
				label: doc.title,
				href: `/documents/${doc.slug}`,
				metric: doc.open,
				downloadHref: `/api/documents/${doc.slug}/download`,
				downloadLabel: 'Download markdown',
				deleteConfirm: `Delete ${doc.title}? This removes the file, comments, and suggestions.`,
				deleteFields: [{ name: 'slug', value: doc.slug }],
				renameCurrentName: doc.relativePath.split('/').pop() ?? doc.relativePath,
				renameFields: [{ name: 'slug', value: doc.slug }]
			})
		)
	);

	function uploadSelected() {
		if (fileInput.files?.length) formEl.requestSubmit();
	}

	function closeAddMenu() {
		if (addMenu) addMenu.open = false;
	}

	function chooseUpload() {
		closeAddMenu();
		fileInput.click();
	}

	function chooseCreate() {
		closeAddMenu();
		createName = '';
		createError = '';
		setTimeout(() => {
			createDialog?.showModal();
			createNameInput?.focus();
		}, 0);
	}
</script>

<svelte:window
	onclick={(event) => {
		if (!addMenu?.open) return;
		if (event.target instanceof Node && addMenu.contains(event.target)) return;
		closeAddMenu();
	}}
	onkeydown={(event) => {
		if (event.key === 'Escape') closeAddMenu();
	}}
/>

<Chrome title="Documents" user={data.user} homeHref="/admin" />
<main class="page stack">
	<AdminNav current="documents" />
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	{#if form?.uploaded}
		<p class="muted">Uploaded <a href="/documents/{form.uploaded}">{form.uploaded}</a></p>
	{/if}
	{#if form?.created}
		<p class="muted">Created <a href="/documents/{form.created}">{form.created}</a></p>
	{/if}
	<div class="add-wrap">
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
		</form>
		<details bind:this={addMenu} class="account-menu add-menu">
			<summary class="icon-btn" title="Add document" aria-label="Add document">
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path
						d="M8 3.2v9.6M3.2 8h9.6"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					/>
				</svg>
			</summary>
			<div class="account-menu-panel">
				<button type="button" onclick={chooseUpload}>Upload markdown file</button>
				<button type="button" onclick={chooseCreate}>Create markdown file</button>
			</div>
		</details>
	</div>
	<AdminFileTable
		rows={rows}
		metricHeader="Open"
		metricTitle="Unresolved comments and suggestions"
	/>
</main>

<FileNameDialog
	bind:dialog={createDialog}
	bind:inputEl={createNameInput}
	bind:filename={createName}
	bind:error={createError}
	title="Create markdown file"
	action="?/create"
	submitLabel="Create"
	placeholder="notes.md"
/>

<style>
	.add-wrap {
		display: flex;
		justify-content: flex-end;
	}

	.upload-form {
		display: contents;
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

	.add-menu > summary.icon-btn {
		padding: 0;
	}

	.add-menu > summary.icon-btn::after {
		display: none;
		content: none;
		margin: 0;
	}
</style>
