<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Chrome from '$lib/components/Chrome.svelte';
	import { applySubstitutions } from '$lib/anchor';
	import {
		commentIdsFromTarget,
		createGlassineEditor,
		liveCommentRanges,
		sameCommentRanges,
		sameIdList,
		stackCommentTops,
		type GlassineEditor,
		type HydratableAnnotation
	} from '$lib/editor';
	import {
		allowedViewMode,
		defaultViewMode,
		isReadingViewMode,
		readViewMode,
		writeViewMode,
		type ViewMode
	} from '$lib/view-mode';
	import type { Transaction } from 'prosemirror-state';

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

	const DRAFT_ID = '__draft';
	let viewMode = $state<ViewMode>(defaultViewMode(user.role));

	let mount: HTMLDivElement | undefined = $state();
	let gutterEl: HTMLDivElement | undefined = $state();
	let editor: GlassineEditor | undefined;
	let editorGen = $state(0);
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
	let seenVersion = $state(version);
	let lastDocTr: Transaction | null = null;
	let savingOwnEdit = false;
	let hoveredCommentIds = $state<string[]>([]);
	let selectedCommentId = $state<string | null>(null);
	let caretCommentIds = $state<string[]>([]);
	let commentRanges = $state<{ id: string; from: number; to: number }[]>([]);
	let attachedCommentIds = $state<string[]>([]);
	let commentTops = $state<Record<string, number>>({});
	let composeFrom = $state<number | null>(null);
	let composeRange = $state<{ start: number; end: number } | null>(null);
	const cardEls: Record<string, HTMLElement | undefined> = {};
	let layoutTimer: ReturnType<typeof setTimeout> | undefined;

	const threads = $derived(annotations.filter((a) => a.type === 'comment' && !a.parentId));
	const repliesOf = (id: string) => annotations.filter((a) => a.parentId === id);
	const detachedIds = $derived(new Set(detached.map((item) => item.id)));
	const liveIds = $derived(new Set(commentRanges.map((range) => range.id)));
	const attachedIdSet = $derived.by(() => {
		if (attachedCommentIds.length) return new Set(attachedCommentIds);
		if (liveIds.size) return liveIds;
		return new Set(threads.filter((item) => !detachedIds.has(item.id)).map((item) => item.id));
	});
	const attachedThreads = $derived(threads.filter((item) => attachedIdSet.has(item.id)));
	const unattachedComments = $derived(threads.filter((item) => !attachedIdSet.has(item.id)));
	const detachedSuggestions = $derived(detached.filter((item) => item.type === 'suggestion'));
	const emphasizedIds = $derived.by(() => {
		const ids = new Set<string>([...hoveredCommentIds, ...caretCommentIds]);
		if (selectedCommentId) ids.add(selectedCommentId);
		return [...ids];
	});
	const reading = $derived(isReadingViewMode(viewMode));
	const showFlags = $derived(
		!reading &&
			Boolean(
				(overlapping.length && user.role === 'author') ||
					detachedSuggestions.length ||
					unattachedComments.length
			)
	);

	onMount(() => {
		viewMode = readViewMode(user.role);
	});

	$effect(() => {
		const next = allowedViewMode(viewMode, user.role);
		if (next === viewMode) return;
		viewMode = next;
		writeViewMode(next);
	});

	$effect(() => {
		if (!mount) return;
		const currentSource = source;
		const currentAnns = viewMode === 'reading' ? [] : annotations;
		const readingNow = isReadingViewMode(viewMode);
		const userId = user.id;
		const highlightColor = user.highlightColor ?? '#7c9cff';
		const mountEl = mount;

		knownIds = new Set(currentAnns.map((a) => a.id));
		const instance = untrack(() =>
			createGlassineEditor({
				source: currentSource,
				annotations: currentAnns,
				mode: readingNow ? 'edit' : 'suggest',
				editable: !readingNow,
				previewAccepted: viewMode === 'reading-modified',
				user: { id: userId, highlightColor },
				mount: mountEl,
				onUpdate(view, _parsed, tr) {
					if (editor?.view !== view) return;
					const next = liveCommentRanges(view.state);
					if (!sameCommentRanges(commentRanges, next)) commentRanges = next;
					updateSelected();
					if (tr.docChanged) {
						lastDocTr = tr;
						dirty = true;
						queueSave();
						queueRelayout();
					}
				}
			})
		);

		untrack(() => {
			editor = instance;
			detached = instance.detached;
			overlapping = instance.overlapping;
			attachedCommentIds = instance.attachedCommentIds ?? [];
			commentRanges = instance.getCommentRanges();
			editorGen += 1;
		});
		queueRelayout();
		const lateLayout = setTimeout(relayout, 50);
		return () => {
			clearTimeout(lateLayout);
			clearTimeout(saveTimer);
			instance.destroy();
			if (editor === instance) editor = undefined;
		};
	});

	$effect(() => {
		seenVersion = version;
	});

	$effect(() => {
		const currentSlug = slug;
		sse?.close();
		const es = new EventSource(`/api/articles/${currentSlug}/events`);
		sse = es;
		es.addEventListener('base-moved', (ev) => {
			const data = JSON.parse((ev as MessageEvent).data) as { version: number };
			if (data.version === seenVersion) return;
			if (savingOwnEdit) {
				seenVersion = data.version;
				return;
			}
			banner = dirty
				? 'The article was updated. Finish what you are typing, then reload.'
				: 'The article was updated.';
		});
		return () => es.close();
	});

	$effect(() => {
		void editorGen;
		untrack(() => updateSelected());
	});

	$effect(() => {
		void emphasizedIds;
		untrack(() => editor?.setEmphasizedComments(emphasizedIds));
	});

	$effect(() => {
		void editorGen;
		void commentOpen;
		void replyTo;
		void selectedCommentId;
		void attachedThreads.length;
		untrack(() => queueRelayout());
	});

	onDestroy(() => {
		clearTimeout(saveTimer);
		sse?.close();
		if (layoutTimer) clearTimeout(layoutTimer);
	});

	function queueSave() {
		if (isReadingViewMode(viewMode)) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (viewMode === 'suggesting') void persistSuggestions();
			if (viewMode === 'editing' && user.role === 'author') void persistAuthorEdit();
		}, 900);
	}

	async function setViewMode(mode: ViewMode) {
		const next = allowedViewMode(mode, user.role);
		if (next === viewMode) return;
		clearTimeout(saveTimer);
		if (viewMode === 'suggesting') await persistSuggestions();
		if (viewMode === 'editing' && user.role === 'author') await persistAuthorEdit();
		if (isReadingViewMode(next)) {
			commentOpen = false;
			replyTo = null;
			composeRange = null;
			composeFrom = null;
		}
		writeViewMode(next);
		viewMode = next;
		await invalidateAll();
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
		const foundComments = editor.commentIdsAtSelection();
		if (!sameIdList(caretCommentIds, foundComments)) caretCommentIds = foundComments;
	}

	function queueRelayout() {
		if (layoutTimer) return;
		layoutTimer = setTimeout(() => {
			layoutTimer = undefined;
			relayout();
		}, 0);
	}

	function relayout() {
		const gutter = gutterEl ?? mount?.parentElement?.querySelector('.comment-gutter');
		if (!gutter || !mount) return;
		const gutterTop = gutter.getBoundingClientRect().top;
		const items = attachedThreads.map((thread) => {
			const height = cardEls[thread.id]?.offsetHeight || 72;
			return {
				id: thread.id,
				desiredTop: Math.round(centeredTop(boxForHighlight(thread.id, gutterTop), height)),
				height
			};
		});
		if (commentOpen && !replyTo) {
			const height = cardEls[DRAFT_ID]?.offsetHeight || 160;
			items.push({
				id: DRAFT_ID,
				desiredTop: Math.round(
					centeredTop(boxForPos(composeFrom ?? editor?.view.state.selection.from, gutterTop), height)
				),
				height
			});
		}
		const activeId = commentOpen && !replyTo ? DRAFT_ID : selectedCommentId;
		const tops = stackCommentTops(items, {
			gap: 8,
			activeId,
			minTop: 0,
			maxBottom: Math.max(gutter.offsetHeight, mount.offsetHeight)
		});
		if (sameTops(commentTops, tops)) return;
		commentTops = tops;
	}

	function sameTops(a: Record<string, number>, b: Record<string, number>) {
		const keys = Object.keys(a);
		if (keys.length !== Object.keys(b).length) return false;
		return keys.every((key) => Math.abs((a[key] ?? 0) - b[key]) < 2);
	}

	function centeredTop(box: { top: number; bottom: number }, height: number) {
		return (box.top + box.bottom) / 2 - height / 2;
	}

	function boxForHighlight(id: string, gutterTop: number) {
		const highlights = mount?.querySelectorAll(`.comment-hl[data-comment-id="${CSS.escape(id)}"]`);
		if (highlights?.length) {
			let top = Infinity;
			let bottom = -Infinity;
			for (const highlight of highlights) {
				const rect = highlight.getBoundingClientRect();
				top = Math.min(top, rect.top);
				bottom = Math.max(bottom, rect.bottom);
			}
			if (Number.isFinite(top) && Number.isFinite(bottom)) {
				return { top: top - gutterTop, bottom: bottom - gutterTop };
			}
		}
		const range = commentRanges.find((item) => item.id === id);
		return boxForPos(range?.from, gutterTop);
	}

	function boxForPos(pos: number | undefined, gutterTop: number) {
		if (pos == null || !editor) return { top: 0, bottom: 0 };
		try {
			const coords = editor.view.coordsAtPos(pos);
			return { top: coords.top - gutterTop, bottom: coords.bottom - gutterTop };
		} catch {
			return { top: 0, bottom: 0 };
		}
	}

	function trackCard(node: HTMLElement, id: string) {
		cardEls[id] = node;
		const onEnter = () => hoverCard(id);
		const onLeave = (event: MouseEvent) => unhoverCard(event);
		const onClick = () => {
			if (id !== DRAFT_ID) selectedCommentId = id;
		};
		node.addEventListener('mouseenter', onEnter);
		node.addEventListener('mouseleave', onLeave);
		node.addEventListener('click', onClick);
		return {
			update(newId: string) {
				if (newId === id) return;
				delete cardEls[id];
				id = newId;
				cardEls[id] = node;
			},
			destroy() {
				node.removeEventListener('mouseenter', onEnter);
				node.removeEventListener('mouseleave', onLeave);
				node.removeEventListener('click', onClick);
				delete cardEls[id];
			}
		};
	}

	$effect(() => {
		void editorGen;
		if (!mount) return;
		const el = mount;
		const onOver = (event: MouseEvent) => {
			const ids = commentIdsFromTarget(event.target);
			if (!sameIdList(hoveredCommentIds, ids)) hoveredCommentIds = ids;
		};
		const onOut = (event: MouseEvent) => {
			if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.comment-card')) {
				return;
			}
			const ids = commentIdsFromTarget(event.relatedTarget);
			if (!sameIdList(hoveredCommentIds, ids)) hoveredCommentIds = ids;
		};
		const onClick = (event: MouseEvent) => {
			selectedCommentId = commentIdsFromTarget(event.target)[0] ?? null;
		};
		el.addEventListener('mouseover', onOver);
		el.addEventListener('mouseout', onOut);
		el.addEventListener('click', onClick);
		return () => {
			el.removeEventListener('mouseover', onOver);
			el.removeEventListener('mouseout', onOut);
			el.removeEventListener('click', onClick);
		};
	});

	function hoverCard(id: string) {
		if (!sameIdList(hoveredCommentIds, [id])) hoveredCommentIds = [id];
		const ids = new Set<string>([id, ...caretCommentIds]);
		if (selectedCommentId) ids.add(selectedCommentId);
		editor?.setEmphasizedComments([...ids]);
	}

	function selectComment(id: string) {
		if (id !== DRAFT_ID) selectedCommentId = id;
		hoverCard(id);
	}

	function unhoverCard(event?: FocusEvent | MouseEvent) {
		if (event?.relatedTarget instanceof Element && event.relatedTarget.closest('.comment-hl, .comment-card')) {
			return;
		}
		if (hoveredCommentIds.length) hoveredCommentIds = [];
		const ids = new Set<string>(caretCommentIds);
		if (selectedCommentId) ids.add(selectedCommentId);
		editor?.setEmphasizedComments([...ids]);
	}

	async function persistSuggestions() {
		if (!editor || viewMode !== 'suggesting') return;
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
		if (!editor || user.role !== 'author' || viewMode !== 'editing') return;
		const extracted = editor
			.extractNewSuggestions(knownIds)
			.filter((item) => !item.authorId || item.authorId === user.id);
		const fromHistory =
			extracted.length || !lastDocTr?.getMeta('history$')
				? []
				: editor.substitutionsFromTransaction(lastDocTr);
		const substitutions = extracted.length ? extracted : fromHistory;
		if (!substitutions.length) return;
		savingOwnEdit = true;
		try {
			const res = await fetch(`/api/articles/${slug}/save`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ substitutions })
			});
			if (res.ok) {
				const body = (await res.json()) as { version: number };
				editor.acceptLocalSuggestions(extracted.map((item) => item.id));
				try {
					const next = applySubstitutions(editor.parsed.source, substitutions);
					editor.retargetSource(next.source);
				} catch {
					/* server already wrote; keep the local accept even if the quote map is stale */
				}
				for (const item of extracted) knownIds.add(item.id);
				lastDocTr = null;
				seenVersion = body.version;
				status = 'Saved';
				dirty = false;
			} else {
				const body = await res.json().catch(() => ({}));
				status = (body as { message?: string }).message ?? 'Save failed';
			}
		} finally {
			savingOwnEdit = false;
		}
	}

	async function submitComment() {
		if (!editor || !commentBody.trim()) return;
		let payload: Record<string, unknown>;
		if (replyTo) {
			payload = { comment: { body: commentBody.trim(), parentId: replyTo } };
		} else {
			const range = composeRange ?? editor.getSelectionSourceRange();
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
			composeRange = null;
			composeFrom = null;
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

	function openComposer() {
		if (isReadingViewMode(viewMode)) return;
		if (editor && !commentOpen) {
			composeFrom = editor.view.state.selection.from;
			composeRange = editor.getSelectionSourceRange();
		}
		commentOpen = !commentOpen;
		replyTo = null;
		queueRelayout();
	}

	function startReply(id: string) {
		if (isReadingViewMode(viewMode)) return;
		replyTo = id;
		commentOpen = true;
		selectedCommentId = id;
	}
</script>

<svelte:window onresize={queueRelayout} />

<Chrome
	{title}
	{user}
	{viewMode}
	onViewModeChange={setViewMode}
	homeHref={user.role === 'author' ? '/admin' : '/reviews'}
/>

{#if banner}
	<div class="banner">
		{banner}
		<button type="button" onclick={() => location.reload()}>Reload</button>
	</div>
{/if}

<div class="chrome" style="top:auto;bottom:0;border-top:1px solid var(--line);border-bottom:none">
	{#if !reading}
		<button type="button" aria-pressed={commentOpen && !replyTo} onclick={openComposer}>Comment</button>
		{#if user.role === 'author' && selectedSuggestion}
			<button type="button" class="primary" onclick={() => act(selectedSuggestion!, 'accept', true)}
				>Accept</button
			>
			<button type="button" onclick={() => act(selectedSuggestion!, 'reject')}>Reject</button>
		{/if}
	{/if}
	<span class="muted">{status}</span>
	<div class="chrome-spacer"></div>
	<a href="/api/articles/{slug}/download">Download .md</a>
</div>

<div class="article-shell" class:is-reading={reading}>
	<div class="glassine-doc" class:is-reading={reading} bind:this={mount}></div>
	{#if !reading}
	<div class="comment-gutter" bind:this={gutterEl}>
		{#each attachedThreads as item (item.id)}
			<div
				class="comment-card"
				class:is-emphasized={selectedCommentId === item.id || hoveredCommentIds.includes(item.id) || caretCommentIds.includes(item.id)}
				data-comment-id={item.id}
				style="top: {commentTops[item.id] ?? 0}px; --comment-color: {item.highlightColor ?? 'var(--accent)'}"
				use:trackCard={item.id}
				onpointerdown={() => selectComment(item.id)}
				onmouseenter={() => hoverCard(item.id)}
				onmouseleave={unhoverCard}
			>
				{@render commentContent(item, true)}
			</div>
		{/each}
		{#if commentOpen && !replyTo}
			<div
				class="comment-card comment-draft is-emphasized"
				style="top: {commentTops[DRAFT_ID] ?? 0}px"
				use:trackCard={DRAFT_ID}
			>
				<h2>Comment on selection</h2>
				<textarea rows="4" bind:value={commentBody} placeholder="Your comment"></textarea>
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
	</div>
	{/if}
</div>

{#if showFlags && !(commentOpen && !replyTo)}
	<div class="side-panel side-panel-flags">
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
		{#if detachedSuggestions.length}
			<h2>Outdated</h2>
			<p class="muted"
				>The passage has been edited or removed. The quoted text is kept so you can still act on it.</p
			>
			{#each detachedSuggestions as item (item.id)}
				<div class="card">
					<div class="muted">{item.headingPath}{item.paraOrdinal ? ` · paragraph ${item.paraOrdinal}` : ''}</div>
					<div class="quote">“{item.exact}”</div>
					{#if item.replacement}<p>Suggested: {item.replacement}</p>{/if}
					<div class="row">
						{#if user.role === 'author'}
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
		{#if unattachedComments.length}
			<h2>Unattached comments</h2>
			<p class="muted">These no longer match a passage. The quote is kept so you can re-attach them.</p>
			{#each unattachedComments as item (item.id)}
				<div
					class="comment-card comment-card-static"
					class:is-emphasized={selectedCommentId === item.id || hoveredCommentIds.includes(item.id) || caretCommentIds.includes(item.id)}
					data-comment-id={item.id}
					style="--comment-color: {item.highlightColor ?? 'var(--accent)'}"
					use:trackCard={item.id}
					onpointerdown={() => selectComment(item.id)}
					onmouseenter={() => hoverCard(item.id)}
					onmouseleave={unhoverCard}
				>
					{@render commentContent(item, false)}
				</div>
			{/each}
		{/if}
	</div>
{/if}

{#snippet commentContent(item: HydratableAnnotation, attached: boolean)}
	<div class="comment-author">{item.authorName || 'Unknown'}</div>
	{#if !attached}
		<div class="muted">{item.headingPath}{item.paraOrdinal ? ` · paragraph ${item.paraOrdinal}` : ''}</div>
		<div class="quote">“{item.exact}”</div>
	{/if}
	{#if item.body}<p>{item.body}</p>{/if}
	{#each repliesOf(item.id) as reply (reply.id)}
		<div class="comment-reply">
			<div class="comment-author">{reply.authorName || 'Unknown'}</div>
			{#if reply.body}<p>{reply.body}</p>{/if}
		</div>
	{/each}
	{#if replyTo === item.id && commentOpen}
		<textarea rows="3" bind:value={commentBody} placeholder="Reply"></textarea>
		<div class="row">
			<button type="button" class="primary" onclick={submitComment}>Save reply</button>
			<button
				type="button"
				onclick={() => {
					commentOpen = false;
					replyTo = null;
				}}>Cancel</button
			>
		</div>
	{:else}
		<button type="button" onclick={() => startReply(item.id)}>Reply</button>
	{/if}
	{#if !attached}
		<div class="row">
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
	{/if}
{/snippet}
