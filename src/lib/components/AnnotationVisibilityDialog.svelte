<script lang="ts">
	import { sortPeople, type AccessPerson } from '$lib/access';
	import { isAuthorShown, type ShownOverrides, type Viewer } from '$lib/annotation-visibility';

	let {
		sources,
		viewer,
		overrides,
		onToggle,
		dialog = $bindable()
	}: {
		/** Everyone whose annotations the reviewer has permission to see. */
		sources: AccessPerson[];
		viewer: Viewer;
		overrides: ShownOverrides;
		onToggle: (id: string, shown: boolean) => void;
		dialog?: HTMLDialogElement;
	} = $props();

	const listed = $derived.by(() => {
		const others = sortPeople(sources.filter((person) => person.id !== viewer.id));
		return [...sources.filter((person) => person.id === viewer.id), ...others];
	});
</script>

<dialog bind:this={dialog} class="annotations-dialog" closedby="any">
	<div class="annotations-header">
		<h2>Annotations</h2>
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
	<p class="muted">Choose whose comments and suggestions to show in the document.</p>
	{#each listed as person (person.id)}
		{@const shown = isAuthorShown(person.id, overrides, viewer, sources)}
		<div class="annotations-row">
			<span class="annotations-name">
				{person.name}{#if person.id === viewer.id}<span class="annotations-tag muted">(you)</span>{/if}
				{#if person.role === 'author'}<span class="annotations-tag muted">Author</span>{/if}
			</span>
			<button
				type="button"
				class="icon-btn"
				aria-pressed={shown}
				title={shown ? `Hide ${person.name}'s annotations` : `Show ${person.name}'s annotations`}
				aria-label="{shown ? 'Hide' : 'Show'} annotations from {person.name}"
				onclick={() => onToggle(person.id, !shown)}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path
						d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linejoin="round"
					/>
					{#if shown}
						<circle cx="8" cy="8" r="2.1" fill="currentColor" />
					{:else}
						<path d="M2.5 13.5 13.5 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
					{/if}
				</svg>
			</button>
		</div>
	{/each}
</dialog>

<style>
	h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.annotations-dialog {
		background: var(--bg);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 1rem 1.1rem;
		width: min(26rem, calc(100vw - 2rem));
		max-height: min(32rem, calc(100vh - 4rem));
		overflow: auto;
	}

	.annotations-dialog::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.annotations-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--line);
	}

	.annotations-header h2 {
		flex: 1;
		min-width: 0;
	}

	.annotations-header form {
		display: flex;
		margin: 0;
	}

	.annotations-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--line);
	}

	.annotations-row:last-child {
		border-bottom: 0;
	}

	.annotations-name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		line-height: 1.2;
	}

	.annotations-tag {
		font-size: 0.8rem;
		margin-inline-start: 0.35rem;
	}

	.annotations-row .icon-btn[aria-pressed='false'] {
		color: var(--muted);
	}
</style>
