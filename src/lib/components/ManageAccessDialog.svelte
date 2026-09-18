<script lang="ts">
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import { groupReviewersByAccess, type AccessReviewer } from '$lib/access';

	let {
		reviewers,
		grantedReviewerIds,
		slug,
		dialog = $bindable()
	}: {
		reviewers: AccessReviewer[];
		grantedReviewerIds: string[];
		slug: string;
		dialog?: HTMLDialogElement;
	} = $props();

	let overrides = $state<Record<string, boolean>>({});
	let copied = $state('');
	let copiedId = $state('');

	$effect(() => {
		void slug;
		overrides = {};
		copied = '';
		copiedId = '';
	});

	const grantedIds = $derived.by(() => {
		const ids = new Set(grantedReviewerIds);
		for (const [id, granted] of Object.entries(overrides)) {
			if (granted) ids.add(id);
			else ids.delete(id);
		}
		return ids;
	});
	const grouped = $derived(groupReviewersByAccess(reviewers, grantedIds));
	const listed = $derived([...grouped.granted, ...grouped.others]);

	function setGranted(reviewerId: string, granted: boolean) {
		overrides = { ...overrides, [reviewerId]: granted };
	}

	async function postAction(action: 'grant' | 'revoke' | 'copy', reviewerId: string) {
		const body = new FormData();
		body.set('reviewerId', reviewerId);
		if (action === 'grant') body.set('visibilityScope', 'own');
		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await response.text()) as ActionResult;
	}

	async function toggleAccess(reviewerId: string, grant: boolean) {
		const result = await postAction(grant ? 'grant' : 'revoke', reviewerId);
		if (result.type === 'success') setGranted(reviewerId, grant);
	}

	async function copyInvite(reviewerId: string) {
		const result = await postAction('copy', reviewerId);
		if (result.type === 'success' && result.data && 'invite' in result.data) {
			copied = String(result.data.invite);
			copiedId = reviewerId;
			try {
				await navigator.clipboard.writeText(copied);
			} catch {
				/* the invite is still shown in the dialog */
			}
		}
	}
</script>

<dialog bind:this={dialog} class="access-dialog" closedby="any">
	<div class="access-header">
		<h2>Manage access</h2>
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
	{#if copied}
		<p class="muted">
			Invite: <code>{copied}</code>
		</p>
	{/if}
	{#if reviewers.length === 0}
		<p class="muted">No reviewers yet. Add people in <a href="/admin/reviewers">Reviewers</a>.</p>
	{/if}
	{#each listed as reviewer (reviewer.id)}
		{@const hasAccess = grantedIds.has(reviewer.id)}
		<div class="access-row">
			<label class="access-person">
				<input
					type="checkbox"
					checked={hasAccess}
					onclick={(event) => {
						event.preventDefault();
						void toggleAccess(reviewer.id, !hasAccess);
					}}
				/>
				<span>{reviewer.name}</span>
			</label>
			<button type="button" onclick={() => copyInvite(reviewer.id)}
				>{copiedId === reviewer.id ? 'Copied' : 'Copy invite'}</button
			>
		</div>
	{/each}
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
		max-width: 36rem;
		width: min(36rem, calc(100vw - 2rem));
		max-height: min(36rem, calc(100vh - 4rem));
		overflow: auto;
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

	.access-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line);
	}

	.access-row:last-child {
		border-bottom: 0;
	}

	.access-person {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex: 1;
		min-width: 0;
		margin: 0;
		cursor: pointer;
	}

	.access-person input[type='checkbox'] {
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
		accent-color: var(--accent);
	}

	.access-person input[type='checkbox']:checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.access-person input[type='checkbox']:checked::after {
		content: '';
		width: 0.28rem;
		height: 0.5rem;
		border: solid var(--bg);
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
		margin-bottom: 0.12rem;
	}

	.access-person span {
		min-width: 0;
		overflow-wrap: anywhere;
		line-height: 1.2;
	}

	.access-row > button {
		flex: none;
		white-space: nowrap;
	}
</style>
