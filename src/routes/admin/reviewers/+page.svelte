<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import AnnotationScopeSelect from '$lib/components/AnnotationScopeSelect.svelte';
	import type { AccessPerson } from '$lib/access';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let copied = $state('');
	let createColor = $state('');
	let accessReviewerId = $state('');
	let accessDialog: HTMLDialogElement | undefined;

	const accessReviewer = $derived(data.reviewers.find((reviewer) => reviewer.id === accessReviewerId));

	$effect(() => {
		if (form && 'invite' in form && form.invite) copied = String(form.invite);
	});

	$effect(() => {
		if (accessReviewerId && !accessReviewer) {
			accessDialog?.close();
			accessReviewerId = '';
		}
	});

	async function copyText(text: string) {
		copied = text;
		await navigator.clipboard.writeText(text);
	}

	const copyEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success' && result.data && 'invite' in result.data) {
				copied = String(result.data.invite);
				await navigator.clipboard.writeText(copied);
			}
		};
	};

	const scopePeople = $derived<AccessPerson[]>(
		accessReviewer
			? [
					...data.authors.map((person) => ({ ...person, role: 'author' as const })),
					...data.reviewers
						.filter((reviewer) => reviewer.id !== accessReviewer.id)
						.map((reviewer) => ({ id: reviewer.id, name: reviewer.name, role: 'reviewer' as const }))
				]
			: []
	);

	async function saveScope(reviewerId: string, documentId: string, visibilityScope: string) {
		const body = new FormData();
		body.set('reviewerId', reviewerId);
		body.set('documentId', documentId);
		body.set('visibilityScope', visibilityScope);
		const response = await fetch('?/grant', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text()) as ActionResult;
		if (result.type === 'success') await invalidateAll();
	}

	function openAccess(id: string) {
		accessReviewerId = id;
		accessDialog?.showModal();
	}

	function paintColorField(event: Event, assignCreate = false) {
		const input = event.currentTarget as HTMLInputElement;
		const field = input.closest('.color-field');
		const chip = field?.querySelector('.color-chip') as HTMLElement | null;
		const picker = field?.querySelector('input[type="color"]') as HTMLInputElement | null;
		const hex = field?.querySelector('.color-hex') as HTMLInputElement | null;
		const raw = input.value.trim();
		const normalized = raw.startsWith('#') ? raw : `#${raw}`;
		const valid = /^#[0-9a-fA-F]{6}$/.test(normalized);
		if (input.type === 'color') {
			if (hex) hex.value = input.value;
			if (chip) chip.style.background = input.value;
			if (assignCreate) createColor = input.value;
			return;
		}
		if (valid) {
			if (picker) picker.value = normalized;
			if (chip) chip.style.background = normalized;
		}
	}
</script>

<Chrome title="Reviewers" user={data.user} homeHref="/admin" />
<main class="page stack" style="max-width:56rem">
	<AdminNav current="reviewers" />
	<p class="muted">
		People you add once. Grants are per document. Copying an invite invalidates the previous URL
		but keeps existing sessions valid.
	</p>

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			return async ({ result, update }) => {
				await update();
				if (result.type === 'success') createColor = '';
			};
		}}
		class="add-row"
	>
		<input name="name" placeholder="Display name" required />
		<input name="email" type="email" placeholder="email@example.com (optional)" />
		<label class="color-field">
			<span
				class="color-chip"
				style="background:{createColor || 'color-mix(in srgb, var(--muted) 35%, transparent)'}"
			>
				<input
					type="color"
					value={createColor || '#7c9cff'}
					aria-label="Choose highlight color"
					oninput={(e) => paintColorField(e, true)}
				/>
			</span>
			<input
				class="color-hex"
				name="highlightColor"
				bind:value={createColor}
				placeholder="Auto"
				maxlength="7"
				aria-label="Highlight color"
				oninput={paintColorField}
			/>
		</label>
		<button class="primary" type="submit">Add reviewer</button>
	</form>
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	{#if copied}
		<p class="muted">
			Invite: <code>{copied}</code>
			<button type="button" onclick={() => copyText(copied)}>Copy</button>
		</p>
	{/if}

	{#each data.reviewers as reviewer (reviewer.id)}
		<section class="card stack">
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
				class="stack"
			>
				<input type="hidden" name="reviewerId" value={reviewer.id} />
				<div class="row">
					<div class="color-field">
						<span
							class="color-chip"
							style="background:{reviewer.highlightColor ??
								'color-mix(in srgb, var(--muted) 35%, transparent)'}"
						>
							<input
								type="color"
								value={reviewer.highlightColor ?? '#7c9cff'}
								aria-label="Choose highlight color for {reviewer.name}"
								oninput={paintColorField}
							/>
						</span>
						<input
							class="color-hex"
							name="highlightColor"
							value={reviewer.highlightColor ?? ''}
							placeholder="Auto"
							maxlength="7"
							aria-label="Highlight color for {reviewer.name}"
							oninput={paintColorField}
						/>
					</div>
					<input name="name" value={reviewer.name} required aria-label="Display name" />
					<input
						name="email"
						type="email"
						value={reviewer.email ?? ''}
						placeholder="No email — notifications stay in-app only"
						aria-label="Email"
					/>
					<button type="submit">Save</button>
				</div>
			</form>
			<div class="row card-actions">
				<form method="POST" action="?/copy" use:enhance={copyEnhance}>
					<input type="hidden" name="reviewerId" value={reviewer.id} />
					<button type="submit">Reset and copy invite</button>
				</form>
				<button type="button" onclick={() => openAccess(reviewer.id)}>Manage access</button>
				<form
					class="delete-form"
					method="POST"
					action="?/delete"
					use:enhance
					onsubmit={(e) => {
						if (!confirm(`Delete ${reviewer.name}? This revokes access to the site and every document.`)) {
							e.preventDefault();
						}
					}}
				>
					<input type="hidden" name="reviewerId" value={reviewer.id} />
					<button class="danger" type="submit">Delete</button>
				</form>
			</div>
		</section>
	{/each}
</main>

<dialog
	bind:this={accessDialog}
	class="access-dialog"
	closedby="any"
	onclose={() => {
		accessReviewerId = '';
	}}
>
	{#if accessReviewer}
		<div class="stack">
			<div class="access-header">
				<h2>Manage access · {accessReviewer.name}</h2>
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
			{#if data.docs.length === 0}
				<p class="muted">No documents yet.</p>
			{:else}
				<div class="access-table" role="table">
					<div class="access-row access-head" role="row">
						<span role="columnheader">Document</span>
						<span role="columnheader">Annotations</span>
						<span role="columnheader">Access</span>
						<span role="columnheader">Invite</span>
					</div>
					{#each data.docs as doc (doc.id)}
						{@const g = data.grants.find(
							(x) => x.reviewerId === accessReviewer.id && x.documentId === doc.id
						)}
						<div class="access-row" role="row">
							<span class="access-title" role="cell"><strong>{doc.title}</strong></span>
							<div class="access-cell" role="cell">
								{#if g}
									<AnnotationScopeSelect
										scope={g.visibilityScope}
										remembered={g.customScope}
										people={scopePeople}
										label="Annotations for {doc.title}"
										subject={accessReviewer.name}
										onchange={(scope) => saveScope(accessReviewer.id, doc.id, scope)}
									/>
								{/if}
							</div>
							<div class="access-cell" role="cell">
								{#if g}
									<form method="POST" action="?/revoke" use:enhance>
										<input type="hidden" name="reviewerId" value={accessReviewer.id} />
										<input type="hidden" name="documentId" value={doc.id} />
										<button type="submit">Revoke</button>
									</form>
								{:else}
									<form method="POST" action="?/grant" use:enhance>
										<input type="hidden" name="reviewerId" value={accessReviewer.id} />
										<input type="hidden" name="documentId" value={doc.id} />
										<input type="hidden" name="visibilityScope" value="default" />
										<button type="submit">Grant</button>
									</form>
								{/if}
							</div>
							<div class="access-cell" role="cell">
								<form method="POST" action="?/copy" use:enhance={copyEnhance}>
									<input type="hidden" name="reviewerId" value={accessReviewer.id} />
									<input type="hidden" name="slug" value={doc.slug} />
									<button type="submit">Reset and copy</button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</dialog>

<style>
	h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	button.danger {
		color: var(--danger);
	}

	.delete-form {
		margin-inline-start: auto;
	}

	.add-row {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 2rem;
	}

	.add-row input[name='name'],
	.add-row input[name='email'] {
		flex: 1;
		min-width: 0;
	}

	.add-row button {
		flex: none;
		white-space: nowrap;
	}

	.color-field {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		width: 6.5rem;
		flex: none;
		background: var(--bg-elev);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.22rem 0.4rem 0.22rem 0.28rem;
	}

	.color-chip {
		position: relative;
		width: 1.15rem;
		height: 1.15rem;
		flex: none;
		border-radius: 999px;
		border: 1px solid var(--line);
		overflow: hidden;
	}

	.color-chip input[type='color'] {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
		border: 0;
	}

	.color-hex {
		width: 3.6rem;
		min-width: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.access-dialog {
		background: var(--bg);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: 8px;
		padding: 1rem 1.1rem;
		max-width: 52rem;
		width: min(52rem, calc(100vw - 2rem));
	}

	.access-dialog::backdrop {
		background: rgba(0, 0, 0, 0.55);
	}

	.access-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--line);
	}

	.access-header h2 {
		flex: 1;
		min-width: 0;
	}

	.access-table {
		display: flex;
		flex-direction: column;
	}

	.access-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 10.5rem 5.5rem 8.5rem;
		align-items: center;
		gap: 0.75rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line);
	}

	.access-row:last-child {
		border-bottom: 0;
	}

	.access-head {
		padding-top: 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--muted);
	}

	.access-head > :not(:first-child),
	.access-cell {
		justify-self: center;
		text-align: center;
	}

	.access-title {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.access-cell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		min-height: 2.15rem;
	}

	.access-cell button {
		box-sizing: border-box;
		height: 2.15rem;
		padding-block: 0;
		line-height: 1;
		white-space: nowrap;
		max-width: 100%;
	}
</style>
