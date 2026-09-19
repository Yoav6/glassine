<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import AdminFileTable, { type AdminFileRow } from '$lib/components/AdminFileTable.svelte';
	import { enhance } from '$app/forms';
	import { IMAGE_FILE_ACCEPT } from '$lib/md/images';

	let { data, form } = $props();
	let formEl: HTMLFormElement;
	let fileInput: HTMLInputElement;

	const rows = $derived(
		data.assets.map(
			(asset): AdminFileRow => ({
				key: asset.relativePath,
				label: asset.relativePath,
				metric: asset.usedIn,
				downloadHref: `/api/assets/${asset.relativePath
					.split('/')
					.map((part) => encodeURIComponent(part))
					.join('/')}`,
				downloadLabel: 'Download',
				deleteConfirm: `Delete ${asset.relativePath}? Documents that embed it will keep broken links.`,
				deleteFields: [{ name: 'path', value: asset.relativePath }],
				renameCurrentName: asset.name,
				renameFields: [{ name: 'path', value: asset.relativePath }]
			})
		)
	);

	function uploadSelected() {
		if (fileInput.files?.length) formEl.requestSubmit();
	}
</script>

<Chrome title="Assets" user={data.user} homeHref="/admin" />
<main class="page stack">
	<AdminNav current="assets" />
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	{#if form?.uploaded}
		<p class="muted">Uploaded {form.uploaded}</p>
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
				id="asset-upload"
				type="file"
				name="file"
				accept={IMAGE_FILE_ACCEPT}
				required
				onchange={uploadSelected}
			/>
		</form>
		<button
			class="icon-btn"
			type="button"
			title="Upload asset"
			aria-label="Upload asset"
			onclick={() => fileInput.click()}
		>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="M8 3.2v9.6M3.2 8h9.6"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>
	<AdminFileTable
		rows={rows}
		metricHeader="Used in"
		metricTitle="Documents that reference this file"
	/>
</main>

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
</style>
