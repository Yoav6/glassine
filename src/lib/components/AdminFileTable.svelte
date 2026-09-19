<script lang="ts">
	import { enhance } from '$app/forms';
	import FileNameDialog from './FileNameDialog.svelte';

	export type AdminFileRow = {
		key: string;
		label: string;
		href?: string;
		metric: number | string;
		downloadHref: string;
		downloadLabel: string;
		deleteConfirm: string;
		deleteFields: { name: string; value: string }[];
		renameCurrentName: string;
		renameFields: { name: string; value: string }[];
	};

	let {
		rows,
		metricHeader,
		metricTitle = '',
		renameAction = '?/rename',
		deleteAction = '?/delete'
	}: {
		rows: AdminFileRow[];
		metricHeader: string;
		metricTitle?: string;
		renameAction?: string;
		deleteAction?: string;
	} = $props();

	let renameDialog: HTMLDialogElement | undefined = $state();
	let renameInput: HTMLInputElement | undefined = $state();
	let renameName = $state('');
	let renameError = $state('');
	let renameFields = $state<{ name: string; value: string }[]>([]);

	function openRename(row: AdminFileRow) {
		renameName = row.renameCurrentName;
		renameFields = row.renameFields;
		renameError = '';
		setTimeout(() => {
			renameDialog?.showModal();
			renameInput?.focus();
			renameInput?.select();
		}, 0);
	}
</script>

<table class="data">
	<thead>
		<tr>
			<th>Title</th>
			<th class="metric-col" title={metricTitle || undefined}>{metricHeader}</th>
			<th><span class="visually-hidden">Actions</span></th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.key)}
			<tr>
				<td class="name-cell">
					{#if row.href}
						<a href={row.href}>{row.label}</a>
					{:else}
						<span class="name-label">{row.label}</span>
					{/if}<button
						class="rename-btn"
						type="button"
						title="Rename"
						aria-label="Rename {row.label}"
						onclick={() => openRename(row)}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path
								d="M9.4 3.1 12.9 6.6M2.8 13.2l.7-3.3L10.6 2.8a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2L6.1 12.5l-3.3.7Z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				</td>
				<td class="metric-col">{row.metric}</td>
				<td>
					<div class="row-actions">
						<a
							class="icon-btn"
							href={row.downloadHref}
							title={row.downloadLabel}
							aria-label="{row.downloadLabel} {row.label}"
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
						<form method="POST" action={deleteAction} use:enhance>
							{#each row.deleteFields as field (field.name)}
								<input type="hidden" name={field.name} value={field.value} />
							{/each}
							<button
								class="icon-btn danger"
								type="submit"
								title="Delete"
								aria-label="Delete {row.label}"
								onclick={(e) => {
									if (!confirm(row.deleteConfirm)) e.preventDefault();
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

<FileNameDialog
	bind:dialog={renameDialog}
	bind:inputEl={renameInput}
	bind:filename={renameName}
	bind:error={renameError}
	title="Rename file"
	action={renameAction}
	submitLabel="Rename"
	placeholder={renameName || 'file'}
	hiddenFields={renameFields}
/>

<style>
	.name-cell {
		overflow-wrap: anywhere;
	}

	.rename-btn {
		display: inline-grid;
		place-items: center;
		width: 1lh;
		height: 1lh;
		margin-inline-start: 0.2em;
		padding: 0;
		vertical-align: text-bottom;
		color: var(--muted);
		background: transparent;
		border: none;
		border-radius: 3px;
		cursor: pointer;
	}

	.rename-btn:hover {
		color: var(--ink);
		background: var(--bg-elev);
	}

	.rename-btn svg {
		width: 0.85em;
		height: 0.85em;
		display: block;
		/* Pencil path sits high in its viewBox; nudge for optical centering. */
		transform: translateY(0.12em);
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.35rem;
	}

	table.data :global(th:last-child),
	table.data :global(td:last-child) {
		width: 1%;
		white-space: nowrap;
	}

	table.data .metric-col {
		text-align: center;
	}
</style>
