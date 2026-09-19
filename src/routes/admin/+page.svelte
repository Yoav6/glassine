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
				<th class="open-col" title="Unresolved comments and suggestions">Open</th>
				<th><span class="visually-hidden">Actions</span></th>
			</tr>
		</thead>
		<tbody>
			{#each data.docs as doc}
				<tr>
					<td><a href="/documents/{doc.slug}">{doc.title}</a></td>
					<td class="open-col">{doc.open}</td>
					<td>
						<div class="row-actions">
							<a
								class="icon-btn"
								href="/api/documents/{doc.slug}/download"
								title="Download markdown"
								aria-label="Download {doc.title}"
							>
								<svg viewBox="0 0 16 16" aria-hidden="true">
									<path
										d="M8 2.4v8.2M5.1 8.3 8 11.2l2.9-2.9M3.2 13.6h9.6"
										fill="none"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</a>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="slug" value={doc.slug} />
								<button
									class="icon-btn danger"
									type="submit"
									title="Delete document"
									aria-label="Delete {doc.title}"
									onclick={(e) => {
										if (
											!confirm(
												`Delete ${doc.title}? This removes the file, comments, and suggestions.`
											)
										) {
											e.preventDefault();
										}
									}}
								>
									<svg viewBox="0 0 16 16" aria-hidden="true">
										<path
											d="M3.2 4.2h9.6M6 4.2V2.8h4v1.4M4.4 4.2l.6 9h6l.6-9M6.5 6.4v5M9.5 6.4v5"
											fill="none"
											stroke="currentColor"
											stroke-width="1.6"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
							</form>
						</div>
					</td>
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

	.row-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.35rem;
	}

	table.data th:last-child,
	table.data td:last-child {
		width: 1%;
		white-space: nowrap;
	}

	table.data .open-col {
		text-align: center;
	}
</style>
