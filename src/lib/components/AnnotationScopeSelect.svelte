<script lang="ts">
	import { portal } from '$lib/portal';
	import {
		customSelection,
		scopeKind,
		serializeScope,
		sortPeople,
		type AccessPerson
	} from '$lib/access';

	let {
		scope,
		remembered = null,
		people,
		label,
		subject,
		onchange
	}: {
		/** Stored scope string of the grant. */
		scope: string;
		/** The last Custom selection, kept while the scope is Default so choosing Custom again restores it. */
		remembered?: string | null;
		/** Everyone the reviewer could see besides themselves, the author included; they are always shown their own. */
		people: AccessPerson[];
		label: string;
		/** Name of the reviewer being configured, shown in the picker heading. */
		subject: string;
		onchange: (scope: string) => void;
	} = $props();

	const kind = $derived(scopeKind(scope));
	const sorted = $derived(sortPeople(people));

	let picker = $state<HTMLDialogElement>();
	let selectEl = $state<HTMLSelectElement>();
	let draft = $state<string[]>([]);
	let saved = false;
	// Also remembered here, so a switch made in this visit needs no reload to be restored.
	let lastCustom = $state<string | null>(null);

	$effect(() => {
		if (kind === 'custom') lastCustom = scope;
	});

	function openPicker() {
		draft = customSelection(kind === 'custom' ? scope : (lastCustom ?? remembered ?? scope), people);
		saved = false;
		picker?.showModal();
	}

	function onSelect(event: Event & { currentTarget: HTMLSelectElement }) {
		if (event.currentTarget.value !== 'custom') {
			if (kind !== 'default') onchange('default');
			return;
		}
		// The select is still finishing its own click and closing its dropdown; open the picker after that.
		event.currentTarget.blur();
		setTimeout(openPicker, 0);
	}

	function toggle(id: string) {
		draft = draft.includes(id) ? draft.filter((other) => other !== id) : [...draft, id];
	}

	function save() {
		saved = true;
		onchange(serializeScope({ kind: 'custom', ids: draft }));
		picker?.close();
	}

	function onPickerClose() {
		// Cancelling leaves the select showing "Custom" although nothing changed.
		if (!saved && selectEl) selectEl.value = kind;
	}
</script>

<div class="scope-select">
	<select bind:this={selectEl} value={kind} onchange={onSelect} aria-label={label}>
		<option value="default">Default</option>
		<option value="custom">Custom</option>
	</select>
	{#if kind === 'custom'}
		<button type="button" onclick={openPicker} aria-label="Choose annotations for {subject}"
			>Edit</button
		>
	{/if}
</div>

<dialog
	use:portal
	bind:this={picker}
	class="scope-dialog"
	closedby="closerequest"
	onclose={onPickerClose}
>
	<div class="scope-header">
		<h2>Annotations · {subject}</h2>
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
	<p class="muted">{subject} can see and reply to the comments and suggestions of everyone ticked.</p>
	<label class="scope-person scope-self" title="Always on: people always see their own annotations">
		<input type="checkbox" checked disabled />
		<span>{subject}</span>
		<span class="scope-tag muted">Always on</span>
	</label>
	{#each sorted as person (person.id)}
		<label class="scope-person">
			<input
				type="checkbox"
				checked={draft.includes(person.id)}
				onchange={() => toggle(person.id)}
			/>
			<span>{person.name}</span>
			{#if person.role === 'author'}<span class="scope-tag muted">Author</span>{/if}
		</label>
	{/each}
	<div class="scope-actions">
		<form method="dialog"><button type="submit">Cancel</button></form>
		<button class="primary" type="button" onclick={save}>Save</button>
	</div>
</dialog>

<style>
	.scope-select {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 100%;
	}

	.scope-select select,
	.scope-select button {
		box-sizing: border-box;
		height: 2.15rem;
		padding-block: 0;
		line-height: 1;
		white-space: nowrap;
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.scope-dialog {
		background: var(--bg);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 1rem 1.1rem;
		width: min(26rem, calc(100vw - 2rem));
		max-height: min(32rem, calc(100vh - 4rem));
		overflow: auto;
		text-align: start;
	}

	.scope-dialog::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.scope-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--line);
	}

	.scope-header h2 {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.scope-header form {
		display: flex;
		margin: 0;
	}

	.scope-person {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0;
		margin: 0;
		border-bottom: 1px solid var(--line);
		cursor: pointer;
	}

	.scope-person span:first-of-type {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		line-height: 1.2;
	}

	.scope-tag {
		font-size: 0.8rem;
	}

	.scope-self {
		opacity: 0.55;
		cursor: default;
	}

	.scope-person input[type='checkbox'] {
		appearance: none;
		width: 1.05rem;
		height: 1.05rem;
		margin: 0;
		padding: 0;
		flex: none;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--bg-elev);
		display: grid;
		place-content: center;
	}

	.scope-person input[type='checkbox']:checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.scope-person input[type='checkbox']:checked::after {
		content: '';
		width: 0.28rem;
		height: 0.5rem;
		border: solid var(--bg);
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
		margin-bottom: 0.12rem;
	}

	.scope-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.85rem;
	}

	.scope-actions form {
		margin: 0;
	}
</style>
