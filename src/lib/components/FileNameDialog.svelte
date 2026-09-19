<script lang="ts">
	import { enhance } from '$app/forms';

	let {
		dialog = $bindable(),
		title,
		action,
		submitLabel = 'Save',
		filename = $bindable(''),
		error = $bindable(''),
		hiddenFields = [] as { name: string; value: string }[],
		placeholder = 'notes.md',
		inputEl = $bindable()
	}: {
		dialog?: HTMLDialogElement;
		title: string;
		action: string;
		submitLabel?: string;
		filename?: string;
		error?: string;
		hiddenFields?: { name: string; value: string }[];
		placeholder?: string;
		inputEl?: HTMLInputElement;
	} = $props();
</script>

<dialog bind:this={dialog} class="access-dialog" closedby="any">
	<div class="access-header">
		<h2>{title}</h2>
		<form method="dialog">
			<button class="icon-btn" type="submit" title="Close" aria-label="Close">
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path
						d="M4 4l8 8M12 4l-8 8"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</form>
	</div>
	<form
		class="stack"
		method="POST"
		{action}
		use:enhance={() => {
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') {
					error = '';
					dialog?.close();
					return;
				}
				if (result.type === 'failure' && result.data && 'message' in result.data) {
					error = String(result.data.message);
				}
			};
		}}
	>
		{#if error}<p style="color:var(--danger)">{error}</p>{/if}
		{#each hiddenFields as field (field.name)}
			<input type="hidden" name={field.name} value={field.value} />
		{/each}
		<label class="stack">
			File name
			<input
				bind:this={inputEl}
				bind:value={filename}
				name="filename"
				required
				{placeholder}
				autocomplete="off"
			/>
		</label>
		<div class="row">
			<button class="primary" type="submit">{submitLabel}</button>
		</div>
	</form>
</dialog>

<style>
	h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.access-dialog {
		background: var(--bg);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 1rem 1.1rem;
		max-width: 24rem;
		width: min(24rem, calc(100vw - 2rem));
	}

	.access-dialog::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.access-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 0.75rem;
		margin-bottom: 0.25rem;
		border-bottom: 1px solid var(--line);
	}

	.access-header h2 {
		flex: 1;
		min-width: 0;
	}

	.access-header form {
		display: flex;
		align-items: center;
		margin: 0;
	}
</style>
