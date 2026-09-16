<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Chrome from '$lib/components/Chrome.svelte';
	import { createGlassineEditor, type GlassineEditor, type HydratableAnnotation } from '$lib/editor';

	type User = { id: string; name: string; role: 'author' | 'reviewer'; highlightColor: string | null };

	let {
		slug,
		title,
		source,
		version,
		annotations,
		user
	}: {
		slug: string;
		title: string;
		source: string;
		version: number;
		annotations: HydratableAnnotation[];
		user: User;
	} = $props();

	let mount: HTMLDivElement | undefined = $state();
	let editor: GlassineEditor | undefined;
	let commentBody = $state('');
	let commentOpen = $state(false);
	let replyTo = $state<string | null>(null);
	let status = $state('');
	let banner = $state('');
	let detached = $state<HydratableAnnotation[]>([]);
	let overlapping = $state<HydratableAnnotation[]>([]);
	let selectedSuggestion = $state<string | null>(null);
	let knownIds = new Set<string>();
	let reattachId = $state<string | null>(null);
	let dirty = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let sse: EventSource | undefined;

	const threads = $derived(annotations.filter((a) => a.type === 'comment' && !a.parentId));
	const repliesOf = (id: string) => annotations.filter((a) => a.parentId === id);

	$effect(() => {
		if (!mount) return;
		const currentSource = source;
		const currentAnns = annotations;
		knownIds = new Set(currentAnns.map((a) => a.id));
		const instance = createGlassineEditor({
			source: currentSource,
			annotations: currentAnns,
			mode: 'suggest',
			user: {
				id: user.id,
				highlightColor: user.highlightColor ?? '#7c9cff'
			},
			mount,
			onUpdate(_view, _parsed, docChanged) {
				updateSelected();
				if (!docChanged) return;
				dirty = true;
				queueSave();
			}
		});
		editor = instance;
		detached = instance.detached;
		overlapping = instance.overlapping;
		return () => {
			clearTimeout(saveTimer);
			instance.destroy();
			if (editor === instance) editor = undefined;
		};
	});

	$effect(() => {
		const currentSlug = slug;
		const seenVersion = version;
		sse?.close();
		const es = new EventSource(`/api/articles/${currentSlug}/events`);
		sse = es;
		es.addEventListener('base-moved', (ev) => {
			const data = JSON.parse((ev as MessageEvent).data) as { version: number };
			if (data.version !== seenVersion) {
				banner = dirty
					? 'The article was updated. Finish what you are typing, then reload.'
					: 'The article was updated.';
			}
		});
		return () => es.close();
	});

	onDestroy(() => {
		clearTimeout(saveTimer);
		sse?.close();
	});

	function queueSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void persistSuggestions();
			if (user.role === 'author') void persistAuthorEdit();
		}, 900);
	}

	function updateSelected() {
		if (!editor) return;
		const { from } = editor.view.state.selection;
		let found: string | null = null;
		editor.view.state.doc.nodesBetween(from, from, (node) => {
			for (const mark of node.marks) {
				if (mark.type.name === 'insertion' || mark.type.name === 'deletion') {
					found = String(mark.attrs.id ?? '') || found;
				}
			}
			return true;
		});
		selectedSuggestion = found;
	}

	async function persistSuggestions() {
		if (!editor || user.role !== 'reviewer') return;
		const extracted = editor.extractNewSuggestions(knownIds);
		if (!extracted.length) return;
		const res = await fetch(`/api/articles/${slug}/annotations`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ suggestions: extracted })
		});
		if (res.ok) {
			for (const item of extracted) knownIds.add(item.id);
			status = 'Suggestions saved';
			dirty = false;
		} else {
			status = 'Could not save suggestions';
		}
	}

	async function persistAuthorEdit() {
		if (!editor || user.role !== 'author') return;
		const extracted = editor
			.extractNewSuggestions(knownIds)
			.filter((item) => !item.authorId || item.authorId === user.id);
		if (!extracted.length) return;
		const res = await fetch(`/api/articles/${slug}/save`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ substitutions: extracted })
		});
		if (res.ok) {
			for (const item of extracted) knownIds.add(item.id);
			status = 'Saved';
			dirty = false;
			await invalidateAll();
		} else {
			const body = await res.json().catch(() => ({}));
			status = (body as { message?: string }).message ?? 'Save failed';
		}
	}

	async function submitComment() {
		if (!editor || !commentBody.trim()) return;
		let payload: Record<string, unknown>;
		if (replyTo) {
			payload = { comment: { body: commentBody.trim(), parentId: replyTo } };
		} else {
			const range = editor.getSelectionSourceRange();
			if (!range) {
				status = 'Select text to comment on';
				return;
			}
			payload = { comment: { ...range, body: commentBody.trim(), parentId: null } };
		}
		const res = await fetch(`/api/articles/${slug}/annotations`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.ok) {
			commentBody = '';
			commentOpen = false;
			replyTo = null;
			status = 'Comment saved';
			await invalidateAll();
		} else status = 'Comment failed';
	}

	async function act(id: string, action: 'accept' | 'reject', rejectOverlapping = false) {
		const res = await fetch(`/api/articles/${slug}/${action}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ annotationId: id, rejectOverlapping })
		});
		if (res.ok) location.reload();
		else status = `${action} failed`;
	}

	async function reattach(id: string) {
		if (!editor) return;
		const range = editor.getSelectionSourceRange();
		if (!range) {
			status = 'Select the new passage, then re-attach';
			return;
		}
		const res = await fetch(`/api/articles/${slug}/annotations`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id, ...range })
		});
		if (res.ok) location.reload();
		else status = 'Re-attach failed';
	}
</script>

<Chrome {title} {user} homeHref={user.role === 'author' ? '/admin' : '/reviews'} />

{#if banner}
	<div class="banner">
		{banner}
		<button type="button" onclick={() => location.reload()}>Reload</button>
	</div>
{/if}

<div class="chrome" style="top:auto;bottom:0;border-top:1px solid var(--line);border-bottom:none">
	<button type="button" onclick={() => (commentOpen = !commentOpen)}>Comment</button>
	{#if user.role === 'author' && selectedSuggestion}
		<button type="button" class="primary" onclick={() => act(selectedSuggestion!, 'accept', true)}
			>Accept</button
		>
		<button type="button" onclick={() => act(selectedSuggestion!, 'reject')}>Reject</button>
	{/if}
	<span class="muted">{status}</span>
	<div class="chrome-spacer"></div>
	<a href="/api/articles/{slug}/download">Download .md</a>
</div>

<div class="glassine-doc" bind:this={mount}></div>

{#if commentOpen}
	<div class="side-panel">
		<h2>{replyTo ? 'Reply' : 'Comment on selection'}</h2>
		<textarea rows="5" bind:value={commentBody} placeholder="Your comment"></textarea>
		<div class="row">
			<button type="button" class="primary" onclick={submitComment}>Save comment</button>
			<button
				type="button"
				onclick={() => {
					commentOpen = false;
					replyTo = null;
				}}>Close</button
			>
		</div>
	</div>
{/if}

{#if detached.length || overlapping.length || threads.length}
	<div class="side-panel" style="top: 8.5rem; {commentOpen ? 'display:none' : ''}">
		{#if overlapping.length && user.role === 'author'}
			<h2>Overlapping suggestions</h2>
			<p class="muted">These rewrite the same passage. Accepting one will detach the others.</p>
			{#each overlapping as item (item.id)}
				<div class="card">
					<div class="quote">“{item.exact}”</div>
					<p>{item.replacement}</p>
					<div class="row">
						<button type="button" onclick={() => act(item.id, 'accept', true)}
							>Accept & reject others</button
						>
						<button type="button" onclick={() => act(item.id, 'reject')}>Reject</button>
					</div>
				</div>
			{/each}
		{/if}
		{#if detached.length}
			<h2>Outdated</h2>
			<p class="muted"
				>The passage has been edited or removed. The quoted text is kept so you can still act on it.</p
			>
			{#each detached as item (item.id)}
				<div class="card">
					<div class="muted">{item.headingPath}{item.paraOrdinal ? ` · paragraph ${item.paraOrdinal}` : ''}</div>
					<div class="quote">“{item.exact}”</div>
					{#if item.body}<p>{item.body}</p>{/if}
					{#if item.replacement}<p>Suggested: {item.replacement}</p>{/if}
					<div class="row">
						{#if user.role === 'author' && item.type === 'suggestion'}
							<button type="button" onclick={() => act(item.id, 'reject')}>Reject</button>
						{/if}
						<button
							type="button"
							onclick={() => {
								reattachId = item.id;
								status = 'Select the new passage, then confirm re-attach';
							}}>Re-attach</button
						>
						{#if reattachId === item.id}
							<button type="button" class="primary" onclick={() => reattach(item.id)}>Use selection</button>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
		{#if threads.length}
			<h2>Comments</h2>
			{#each threads as item (item.id)}
				<div class="card">
					<div class="quote">“{item.exact}”</div>
					<p>{item.body}</p>
					<div class="muted">{item.headingPath}</div>
					{#each repliesOf(item.id) as reply (reply.id)}
						<p class="muted">{reply.body}</p>
					{/each}
					<button
						type="button"
						onclick={() => {
							replyTo = item.id;
							commentOpen = true;
						}}>Reply</button
					>
				</div>
			{/each}
		{/if}
	</div>
{/if}
