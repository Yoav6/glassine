<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Chrome from '$lib/components/Chrome.svelte';
	import { applySubstitutions } from '$lib/anchor';
	import {
		SUGGESTION_MENU_CLOSE_MS,
		SUGGESTION_MENU_OPEN_MS,
		canActOnSuggestion,
		commentIdsFromTarget,
		createGlassineEditor,
		liveCommentRanges,
		sameCommentRanges,
		sameIdList,
		shouldKeepSuggestionMenu,
		stackCommentTops,
		suggestionBounds,
		suggestionFromTarget,
		suggestionIdsInDoc,
		suggestionMenuPosition,
		type ExtractedSuggestion,
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
	let hoveredSuggestionId = $state<string | null>(null);
	let menuSuggestionId = $state<string | null>(null);
	let menuSuggestionAuthor = $state<string | null>(null);
	let menuKind = $state<'suggestion' | 'selection' | null>(null);
	let hasTextSelection = $state(false);
	let hoveringSuggestionMenu = $state(false);
	let suggestionMenuPos = $state<{ left: number; top: number } | null>(null);
	let suggestionMenuEl = $state<HTMLDivElement | undefined>();
	let suggestionOpenTimer: ReturnType<typeof setTimeout> | undefined;
	let suggestionCloseTimer: ReturnType<typeof setTimeout> | undefined;
	let saveEpoch = 0;
	let knownIds = new Set<string>();
	let dirty = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let sse: EventSource | undefined;
	let seenVersion = $state(version);
	let lastDocTr: Transaction | null = null;
	let savingOwnEdit = false;
	let applyingDecision = false;
	let persistChain: Promise<void> = Promise.resolve();
	let decisionStack: DecisionRecord[] = [];
	let decisionRedo: DecisionRecord[] = [];

	type DecisionRecord = {
		id: string;
		action: 'accept' | 'reject';
		overlapping: string[];
		overlappingItems: HydratableAnnotation[];
		detachedItems: HydratableAnnotation[];
		rejectOverlapping: boolean;
		sourceBefore: string;
		sourceAfter: string;
	};
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
	const suggestionReplyHosts = $derived(
		annotations.filter(
			(item) =>
				item.type === 'suggestion' && (item.id === replyTo || repliesOf(item.id).length > 0)
		)
	);
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
					if (!tr.docChanged) return;
					queueRelayout();
					if (applyingDecision) return;
					const hist = historyMeta(tr);
					if (!hist) decisionRedo = [];
					lastDocTr = tr;
					if (hist) {
						clearTimeout(saveTimer);
						const matched = matchDecisionFromHistory(hist.redo);
						if (matched) {
							void enqueuePersist(() => commitDecision(matched.rec, matched.kind));
							return;
						}
						const substitutions = captureAuthorHistorySubstitutions(tr);
						dirty = true;
						void enqueuePersist(async () => {
							lastDocTr = tr;
							if (viewMode === 'editing' && user.role === 'author') {
								await persistAuthorEdit(substitutions);
							} else if (viewMode === 'suggesting') {
								await persistSuggestions();
							}
						});
						return;
					}
					dirty = true;
					queueSave();
				}
			})
		);

		untrack(() => {
			editor = instance;
			decisionStack = [];
			decisionRedo = [];
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
		void suggestionReplyHosts.length;
		untrack(() => queueRelayout());
	});

	onDestroy(() => {
		clearTimeout(saveTimer);
		clearTimeout(suggestionOpenTimer);
		clearTimeout(suggestionCloseTimer);
		sse?.close();
		if (layoutTimer) clearTimeout(layoutTimer);
	});

	function enqueuePersist(fn: () => Promise<void>): Promise<void> {
		const run = persistChain.then(fn);
		persistChain = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	function historyMeta(tr: Transaction): { redo: boolean } | null {
		const meta = tr.getMeta('history$') as { redo?: boolean } | boolean | undefined;
		if (!meta) return null;
		if (meta === true) return { redo: false };
		return { redo: Boolean(meta.redo) };
	}

	function queueSave() {
		if (isReadingViewMode(viewMode)) return;
		clearTimeout(saveTimer);
		const epoch = saveEpoch;
		saveTimer = setTimeout(() => {
			if (epoch !== saveEpoch) return;
			if (viewMode === 'suggesting') void persistSuggestions();
			if (viewMode === 'editing' && user.role === 'author') void persistAuthorEdit();
		}, 900);
	}

	function cancelPendingSave() {
		saveEpoch += 1;
		clearTimeout(saveTimer);
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
		const { from, to } = editor.view.state.selection;
		hasTextSelection = from !== to;
		let found: string | null = null;
		editor.view.state.doc.nodesBetween(from, from, (node) => {
			for (const mark of node.marks) {
				if (
					mark.type.name === 'insertion' ||
					mark.type.name === 'deletion' ||
					mark.type.name === 'modification' ||
					mark.type.name === 'blockBoundarySuggestion'
				) {
					found = String(mark.attrs.id ?? '') || found;
				}
			}
			return true;
		});
		selectedSuggestion = found;
		const foundComments = editor.commentIdsAtSelection();
		if (!sameIdList(caretCommentIds, foundComments)) caretCommentIds = foundComments;
		if (reading) return;
		if (from !== to) {
			clearTimeout(suggestionOpenTimer);
			menuKind = 'selection';
			menuSuggestionId = null;
			placeContextMenu();
			return;
		}
		if (menuKind === 'selection' && !hoveringSuggestionMenu) {
			scheduleCloseSuggestionMenu();
		}
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
		const items = [...attachedThreads, ...suggestionReplyHosts].map((thread) => {
			const height = cardEls[thread.id]?.offsetHeight || 72;
			return {
				id: thread.id,
				desiredTop: Math.round(centeredTop(boxForAnchor(thread.id, gutterTop), height)),
				height
			};
		});
		const orphanReply = Boolean(
			commentOpen && replyTo && !items.some((item) => item.id === replyTo)
		);
		if ((commentOpen && !replyTo) || orphanReply) {
			const height = cardEls[DRAFT_ID]?.offsetHeight || 160;
			items.push({
				id: DRAFT_ID,
				desiredTop: Math.round(
					centeredTop(
						orphanReply && replyTo
							? boxForAnchor(replyTo, gutterTop)
							: boxForPos(composeFrom ?? editor?.view.state.selection.from, gutterTop),
						height
					)
				),
				height
			});
		}
		const activeId =
			(commentOpen && !replyTo) || orphanReply ? DRAFT_ID : selectedCommentId || replyTo;
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

	function boxForAnchor(id: string, gutterTop: number) {
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
		if (mount) {
			const suggestion = suggestionBounds(mount, id);
			if (suggestion) {
				return { top: suggestion.top - gutterTop, bottom: suggestion.bottom - gutterTop };
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
			noteHoveredSuggestion(suggestionFromTarget(event.target));
		};
		const onOut = (event: MouseEvent) => {
			if (event.relatedTarget instanceof Element && event.relatedTarget.closest('.comment-card')) {
				return;
			}
			const ids = commentIdsFromTarget(event.relatedTarget);
			if (!sameIdList(hoveredCommentIds, ids)) hoveredCommentIds = ids;
			if (
				event.relatedTarget instanceof Element &&
				event.relatedTarget.closest('.suggestion-menu')
			) {
				return;
			}
			if (!suggestionFromTarget(event.relatedTarget)) noteHoveredSuggestion(null);
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

	$effect(() => {
		if (reading) {
			untrack(() => {
				clearSuggestionTimers();
				hoveredSuggestionId = null;
				menuSuggestionId = null;
				menuKind = null;
				hasTextSelection = false;
				hoveringSuggestionMenu = false;
				suggestionMenuPos = null;
			});
		}
	});

	$effect(() => {
		void selectedSuggestion;
		void hoveredSuggestionId;
		void hoveringSuggestionMenu;
		void menuSuggestionId;
		void menuKind;
		void hasTextSelection;
		untrack(() => {
			if ((menuSuggestionId || menuKind === 'selection') && !keepContextMenu()) {
				scheduleCloseSuggestionMenu();
			}
		});
	});

	$effect(() => {
		void menuSuggestionId;
		void editorGen;
		void menuKind;
		if ((!menuSuggestionId && menuKind !== 'selection') || !mount) return;
		const update = () => untrack(() => placeContextMenu());
		update();
		window.addEventListener('scroll', update, true);
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('scroll', update, true);
			window.removeEventListener('resize', update);
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
		const epoch = saveEpoch;
		const extracted = editor.extractNewSuggestions(knownIds);
		if (!extracted.length) return;
		const res = await fetch(`/api/articles/${slug}/annotations`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ suggestions: extracted })
		});
		if (epoch !== saveEpoch) return;
		if (res.ok) {
			for (const item of extracted) knownIds.add(item.id);
			status = 'Suggestions saved';
			dirty = false;
		} else {
			status = 'Could not save suggestions';
		}
	}

	function captureAuthorHistorySubstitutions(tr: Transaction): ExtractedSuggestion[] {
		if (!editor || user.role !== 'author' || viewMode !== 'editing') return [];
		const extracted = editor
			.extractNewSuggestions(knownIds)
			.filter((item) => !item.authorId || item.authorId === user.id);
		if (extracted.length) return extracted;
		return editor.substitutionsFromTransaction(tr);
	}

	async function persistAuthorEdit(substitutions?: ExtractedSuggestion[]) {
		if (!editor || user.role !== 'author' || viewMode !== 'editing') return;
		const epoch = saveEpoch;
		const extracted = substitutions
			? []
			: editor
					.extractNewSuggestions(knownIds)
					.filter((item) => !item.authorId || item.authorId === user.id);
		const fromHistory =
			substitutions ??
			(extracted.length || !lastDocTr?.getMeta('history$')
				? []
				: editor.substitutionsFromTransaction(lastDocTr));
		const next = substitutions ?? (extracted.length ? extracted : fromHistory);
		if (!next.length) return;
		savingOwnEdit = true;
		try {
			const res = await fetch(`/api/articles/${slug}/save`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ substitutions: next })
			});
			if (epoch !== saveEpoch) return;
			if (res.ok) {
				const body = (await res.json()) as { version: number };
				editor.acceptLocalSuggestions(extracted.map((item) => item.id));
				try {
					const applied = applySubstitutions(editor.parsed.source, next);
					editor.retargetSource(applied.source);
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
		cancelPendingSave();
		await enqueuePersist(async () => {
			if (action === 'accept') savingOwnEdit = true;
			try {
				const res = await fetch(`/api/articles/${slug}/${action}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ annotationId: id, rejectOverlapping })
				});
				if (!res.ok) {
					status = `${action} failed`;
					return;
				}
				const body = (await res.json().catch(() => ({}))) as {
					version?: number;
					overlapping?: string[];
				};
				applyDecisionLocally(id, action, body, rejectOverlapping);
				if (dirty) queueSave();
			} finally {
				savingOwnEdit = false;
			}
		});
	}

	function substitutionFor(id: string) {
		const row = [...annotations, ...overlapping, ...detached].find((item) => item.id === id);
		if (row?.type === 'suggestion') {
			return {
				exact: row.exact,
				prefix: row.prefix,
				suffix: row.suffix,
				offsetHint: row.offsetHint,
				replacement: row.replacement ?? ''
			};
		}
		if (!editor) return null;
		return editor.extractNewSuggestions(new Set()).find((item) => item.id === id) ?? null;
	}

	function hideSuggestionMenu() {
		clearSuggestionTimers();
		menuSuggestionId = null;
		menuSuggestionAuthor = null;
		menuKind = null;
		hoveredSuggestionId = null;
		hoveringSuggestionMenu = false;
		suggestionMenuPos = null;
	}

	function applyDecisionLocally(
		id: string,
		action: 'accept' | 'reject',
		body: { version?: number; overlapping?: string[] },
		rejectOverlapping = false
	) {
		if (!editor) return;
		const overlappingIds = action === 'accept' ? (body.overlapping ?? []) : [];
		const gone = new Set<string>([id, ...overlappingIds]);
		const overlappingItems = overlapping.filter((item) => gone.has(item.id));
		const detachedItems = detached.filter((item) => gone.has(item.id));
		const sourceBefore = editor.parsed.source;
		let sourceAfter = sourceBefore;
		let applied = false;
		applyingDecision = true;
		try {
			if (action === 'accept') {
				const sub = substitutionFor(id);
				applied = editor.acceptLocalSuggestions([id], { history: 'event' });
				if (sub) {
					try {
						sourceAfter = applySubstitutions(sourceBefore, [sub]).source;
						editor.retargetSource(sourceAfter);
					} catch {
						/* marks are already applied; map can catch up on the next remount */
					}
				}
				if (typeof body.version === 'number') seenVersion = body.version;
				status = 'Accepted';
			} else {
				applied = editor.revertLocalSuggestion(id, { history: 'event' });
				status = 'Rejected';
			}
		} finally {
			applyingDecision = false;
		}
		if (applied) {
			decisionStack = [
				...decisionStack,
				{
					id,
					action,
					overlapping: overlappingIds,
					overlappingItems,
					detachedItems,
					rejectOverlapping,
					sourceBefore,
					sourceAfter
				}
			];
			decisionRedo = [];
		}
		overlapping = overlapping.filter((item) => !gone.has(item.id));
		detached = detached.filter((item) => !gone.has(item.id));
		hideSuggestionMenu();
		updateSelected();
		queueRelayout();
	}

	function matchDecisionFromHistory(redo: boolean): { rec: DecisionRecord; kind: 'undo' | 'redo' } | null {
		if (!editor) return null;
		const ids = suggestionIdsInDoc(editor.view.state.doc);
		if (redo) {
			const rec = decisionRedo.at(-1);
			if (!rec || ids.has(rec.id)) return null;
			decisionRedo = decisionRedo.slice(0, -1);
			decisionStack = [...decisionStack, rec];
			hideDecisionUi(rec);
			if (rec.action === 'accept') editor.retargetSource(rec.sourceAfter);
			return { rec, kind: 'redo' };
		}
		const rec = decisionStack.at(-1);
		if (!rec || !ids.has(rec.id)) return null;
		decisionStack = decisionStack.slice(0, -1);
		decisionRedo = [...decisionRedo, rec];
		restoreDecisionUi(rec);
		if (rec.action === 'accept') editor.retargetSource(rec.sourceBefore);
		return { rec, kind: 'undo' };
	}

	function hideDecisionUi(rec: DecisionRecord) {
		const gone = new Set<string>([rec.id, ...rec.overlapping]);
		overlapping = overlapping.filter((item) => !gone.has(item.id));
		detached = detached.filter((item) => !gone.has(item.id));
	}

	function restoreDecisionUi(rec: DecisionRecord) {
		const known = new Set(overlapping.map((item) => item.id));
		overlapping = [
			...overlapping,
			...rec.overlappingItems.filter((item) => !known.has(item.id))
		];
		const knownDetached = new Set(detached.map((item) => item.id));
		detached = [...detached, ...rec.detachedItems.filter((item) => !knownDetached.has(item.id))];
	}

	async function commitDecision(rec: DecisionRecord, kind: 'undo' | 'redo') {
		try {
			if (kind === 'undo') {
				if (rec.action === 'accept') await postUnaccept(rec);
				else await postUnreject(rec.id);
			} else if (rec.action === 'accept') {
				await postAcceptOnly(rec);
			} else {
				await postRejectOnly(rec.id);
			}
		} catch {
			status = kind === 'undo' ? 'Could not undo on the server' : 'Could not redo on the server';
		}
	}

	async function postUnaccept(rec: DecisionRecord) {
		savingOwnEdit = true;
		try {
			const res = await fetch(`/api/articles/${slug}/unaccept`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ annotationId: rec.id, overlapping: rec.overlapping })
			});
			if (!res.ok) throw new Error('unaccept failed');
			const body = (await res.json().catch(() => ({}))) as { version?: number };
			if (typeof body.version === 'number') seenVersion = body.version;
			status = 'Accept undone';
		} finally {
			savingOwnEdit = false;
		}
	}

	async function postUnreject(id: string) {
		const res = await fetch(`/api/articles/${slug}/unreject`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ annotationId: id })
		});
		if (!res.ok) throw new Error('unreject failed');
		status = 'Reject undone';
	}

	async function postAcceptOnly(rec: DecisionRecord) {
		savingOwnEdit = true;
		try {
			const res = await fetch(`/api/articles/${slug}/accept`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					annotationId: rec.id,
					rejectOverlapping: rec.rejectOverlapping
				})
			});
			if (!res.ok) throw new Error('accept failed');
			const body = (await res.json().catch(() => ({}))) as { version?: number };
			if (typeof body.version === 'number') seenVersion = body.version;
			status = 'Accepted';
		} finally {
			savingOwnEdit = false;
		}
	}

	async function postRejectOnly(id: string) {
		const res = await fetch(`/api/articles/${slug}/reject`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ annotationId: id })
		});
		if (!res.ok) throw new Error('reject failed');
		status = 'Rejected';
	}

	function suggestionIsPersisted(id: string) {
		if (knownIds.has(id)) return true;
		return annotations.some((item) => item.id === id && item.type === 'suggestion');
	}

	function authorForSuggestion(id: string, fallback: string | null = null) {
		if (fallback) return fallback;
		return annotations.find((item) => item.id === id)?.authorId ?? null;
	}

	function menuActions(id: string | null, authorId: string | null) {
		if (reading) return { accept: false, reject: false, comment: false };
		if (menuKind === 'selection') return { accept: false, reject: false, comment: true };
		if (!id) return { accept: false, reject: false, comment: false };
		return canActOnSuggestion({ role: user.role, userId: user.id, authorId, viewMode });
	}

	function keepContextMenu() {
		if (hoveringSuggestionMenu) return true;
		if (menuKind === 'selection') return hasTextSelection;
		return shouldKeepSuggestionMenu({
			menuId: menuSuggestionId,
			hoveredId: hoveredSuggestionId,
			caretId: selectedSuggestion,
			hoveringMenu: hoveringSuggestionMenu
		});
	}

	function clearSuggestionTimers() {
		clearTimeout(suggestionOpenTimer);
		clearTimeout(suggestionCloseTimer);
		suggestionOpenTimer = undefined;
		suggestionCloseTimer = undefined;
	}

	function closeSuggestionMenu() {
		if (keepContextMenu()) return;
		menuSuggestionId = null;
		menuSuggestionAuthor = null;
		menuKind = null;
		suggestionMenuPos = null;
	}

	function scheduleCloseSuggestionMenu() {
		clearTimeout(suggestionCloseTimer);
		if (keepContextMenu()) return;
		suggestionCloseTimer = setTimeout(() => {
			suggestionCloseTimer = undefined;
			closeSuggestionMenu();
		}, SUGGESTION_MENU_CLOSE_MS);
	}

	function openSuggestionMenu(hit: { id: string; authorId: string | null }) {
		if (hasTextSelection || commentOpen) return;
		clearSuggestionTimers();
		menuKind = 'suggestion';
		menuSuggestionId = hit.id;
		menuSuggestionAuthor = authorForSuggestion(hit.id, hit.authorId);
		placeContextMenu();
	}

	function noteHoveredSuggestion(hit: { id: string; authorId: string | null } | null) {
		if (reading || hasTextSelection || commentOpen) return;
		clearTimeout(suggestionOpenTimer);
		if (!hit) {
			hoveredSuggestionId = null;
			scheduleCloseSuggestionMenu();
			return;
		}
		hoveredSuggestionId = hit.id;
		clearTimeout(suggestionCloseTimer);
		if (menuKind === 'suggestion' && menuSuggestionId === hit.id) {
			menuSuggestionAuthor = authorForSuggestion(hit.id, hit.authorId);
			placeContextMenu();
			return;
		}
		suggestionOpenTimer = setTimeout(() => {
			suggestionOpenTimer = undefined;
			if (hoveredSuggestionId !== hit.id || hasTextSelection) return;
			openSuggestionMenu(hit);
		}, SUGGESTION_MENU_OPEN_MS);
	}

	function selectionBox() {
		if (!editor) return null;
		const { from, to } = editor.view.state.selection;
		if (from === to) return null;
		try {
			const a = editor.view.coordsAtPos(from);
			const b = editor.view.coordsAtPos(to);
			return {
				left: Math.min(a.left, b.left),
				top: Math.min(a.top, b.top),
				right: Math.max(a.right, b.right),
				bottom: Math.max(a.bottom, b.bottom)
			};
		} catch {
			return null;
		}
	}

	function placeContextMenu() {
		const box =
			menuKind === 'selection'
				? selectionBox()
				: menuSuggestionId && mount
					? suggestionBounds(mount, menuSuggestionId)
					: null;
		if (!box) {
			suggestionMenuPos = null;
			return;
		}
		const size = {
			width: suggestionMenuEl?.offsetWidth || (menuKind === 'selection' ? 36 : 108),
			height: suggestionMenuEl?.offsetHeight || 36
		};
		const pos = suggestionMenuPosition(box, size);
		if (suggestionMenuPos && suggestionMenuPos.left === pos.left && suggestionMenuPos.top === pos.top) return;
		suggestionMenuPos = { left: pos.left, top: pos.top };
	}

	function enterSuggestionMenu() {
		hoveringSuggestionMenu = true;
		clearTimeout(suggestionCloseTimer);
	}

	function leaveSuggestionMenu(event: MouseEvent) {
		if (event.relatedTarget instanceof Element && suggestionFromTarget(event.relatedTarget)) {
			hoveringSuggestionMenu = false;
			return;
		}
		hoveringSuggestionMenu = false;
		scheduleCloseSuggestionMenu();
	}

	async function acceptFromMenu(id: string) {
		cancelPendingSave();
		if (viewMode === 'suggesting') await persistSuggestions();
		if (!suggestionIsPersisted(id)) {
			status = 'Wait for the suggestion to save, then accept';
			return;
		}
		await act(id, 'accept', true);
	}

	async function rejectFromMenu(id: string) {
		cancelPendingSave();
		if (suggestionIsPersisted(id)) {
			await act(id, 'reject');
			return;
		}
		if (editor?.revertLocalSuggestion(id, { history: 'event' })) {
			hideSuggestionMenu();
			status = 'Suggestion discarded';
			dirty = true;
		} else {
			status = 'Could not discard suggestion';
		}
	}

	async function commentOnSuggestion(id: string) {
		if (viewMode === 'suggesting') await persistSuggestions();
		if (!suggestionIsPersisted(id)) {
			status = 'Wait for the suggestion to save, then comment';
			return;
		}
		startReply(id);
		hideSuggestionMenu();
		queueRelayout();
	}

	function commentOnSelection() {
		if (!editor) return;
		const range = editor.getSelectionSourceRange();
		if (!range) {
			status = 'Select text to comment on';
			return;
		}
		composeFrom = editor.view.state.selection.from;
		composeRange = range;
		commentOpen = true;
		replyTo = null;
		hideSuggestionMenu();
		queueRelayout();
	}

	async function reattach(id: string) {
		if (!editor) return;
		const range = editor.getSelectionSourceRange();
		if (!range) {
			status = 'Select a passage first, then re-attach';
			return;
		}
		const res = await fetch(`/api/articles/${slug}/annotations`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id, ...range })
		});
		if (!res.ok) {
			status = 'Re-attach failed';
			return;
		}
		const item = [...annotations, ...overlapping, ...detached].find((row) => row.id === id);
		const mapped = editor.parsed.map.srcRangeToDoc(range.start, range.end);
		if (item?.type === 'comment' && mapped) {
			editor.attachCommentRange({
				id,
				from: mapped.from,
				to: mapped.to,
				color: item.highlightColor,
				authorId: item.authorId
			});
			attachedCommentIds = [...attachedCommentIds.filter((existing) => existing !== id), id];
			detached = detached.filter((row) => row.id !== id);
			selectedCommentId = id;
			status = 'Comment re-attached';
			queueRelayout();
			return;
		}
		const y = window.scrollY;
		await invalidateAll();
		requestAnimationFrame(() => window.scrollTo(0, y));
		status = 'Re-attached';
	}

	function startReply(id: string) {
		if (isReadingViewMode(viewMode)) return;
		replyTo = id;
		commentOpen = true;
		selectedCommentId = id;
		hideSuggestionMenu();
		queueRelayout();
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
		{#if user.role === 'author' && selectedSuggestion}
			{#if viewMode === 'editing'}
				<button type="button" class="primary" onclick={() => act(selectedSuggestion!, 'accept', true)}
					>Accept</button
				>
			{/if}
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
		{#each suggestionReplyHosts as item (item.id)}
			<div
				class="comment-card"
				class:is-emphasized={selectedCommentId === item.id || replyTo === item.id}
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
		{:else if commentOpen && replyTo && !suggestionReplyHosts.some((item) => item.id === replyTo) && !attachedThreads.some((item) => item.id === replyTo)}
			<div
				class="comment-card comment-draft is-emphasized"
				style="top: {commentTops[DRAFT_ID] ?? 0}px"
				use:trackCard={DRAFT_ID}
			>
				<h2>Comment on suggestion</h2>
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
						{#if viewMode === 'editing'}
							<button type="button" onclick={() => act(item.id, 'accept', true)}
								>Accept & reject others</button
							>
						{/if}
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
							onmousedown={(event) => event.preventDefault()}
							onclick={() => reattach(item.id)}>Re-attach</button
						>
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
	{#if item.type === 'suggestion'}
		{#if item.exact}<div class="quote">“{item.exact}”</div>{/if}
		{#if item.replacement}<p>{item.replacement}</p>{/if}
	{:else}
		{#if !attached}
			<div class="muted">{item.headingPath}{item.paraOrdinal ? ` · paragraph ${item.paraOrdinal}` : ''}</div>
			<div class="quote">“{item.exact}”</div>
		{/if}
		{#if item.body}<p>{item.body}</p>{/if}
	{/if}
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
				onmousedown={(event) => event.preventDefault()}
				onclick={() => reattach(item.id)}>Re-attach</button
			>
		</div>
	{/if}
{/snippet}

{#if suggestionMenuPos && !reading && !commentOpen && (menuKind === 'selection' || menuSuggestionId)}
	{@const actions = menuActions(menuSuggestionId, menuSuggestionAuthor)}
	{#if actions.accept || actions.reject || actions.comment}
		<div
			class="suggestion-menu"
			style="left: {suggestionMenuPos.left}px; top: {suggestionMenuPos.top}px"
			bind:this={suggestionMenuEl}
			role="toolbar"
			tabindex="-1"
			aria-label={menuKind === 'selection' ? 'Comment on selection' : 'Suggestion actions'}
			onmousedown={(event) => event.preventDefault()}
			onmouseenter={enterSuggestionMenu}
			onmouseleave={leaveSuggestionMenu}
		>
			{#if actions.accept}
				<button
					type="button"
					class="suggestion-accept"
					aria-label="Accept suggestion"
					onclick={() => acceptFromMenu(menuSuggestionId!)}
				>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M3.2 8.4 6.1 11.3 12.8 4.2"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			{/if}
			{#if actions.comment}
				<button
					type="button"
					class="suggestion-comment"
					aria-label={menuKind === 'selection' ? 'Comment on selection' : 'Comment on suggestion'}
					onclick={() =>
						menuKind === 'selection' ? commentOnSelection() : commentOnSuggestion(menuSuggestionId!)}
				>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M3.2 3.5h9.6c.7 0 1.2.5 1.2 1.2v6.1c0 .7-.5 1.2-1.2 1.2H7.1L4 14.2v-2.2h-.8c-.7 0-1.2-.5-1.2-1.2V4.7c0-.7.5-1.2 1.2-1.2Z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			{/if}
			{#if actions.reject}
				<button
					type="button"
					class="suggestion-reject"
					aria-label="Reject suggestion"
					onclick={() => rejectFromMenu(menuSuggestionId!)}
				>
					<svg viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M4 4 12 12M12 4 4 12"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			{/if}
		</div>
	{/if}
{/if}
