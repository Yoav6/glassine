<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Chrome from '$lib/components/Chrome.svelte';
	import ManageAccessDialog from '$lib/components/ManageAccessDialog.svelte';
	import type { AccessReviewer } from '$lib/access';
	import { applySubstitutions } from '$lib/anchor';
	import {
		SUGGESTION_MENU_CLOSE_MS,
		SUGGESTION_MENU_OPEN_MS,
		canActOnSuggestion,
		commentIdsFromTarget,
		createGlassineEditor,
		extractToc,
		liveCommentRanges,
		persistableSuggestions,
		pickActiveTocIndex,
		sameCommentRanges,
		sameIdList,
		shouldKeepSuggestionMenu,
		stackCommentTops,
		suggestionBounds,
		suggestionFromTarget,
		suggestionIdsInDoc,
		suggestionMenuPosition,
		tocIndent,
		tocMinLevel,
		type GlassineEditor,
		type HydratableAnnotation,
		type SuggestionQuote,
		type TocItem
	} from '$lib/editor';
	import {
		fractionScrollDelta,
		resolveAnchorPos,
		scrollDelta,
		snippetAroundPos,
		type ViewportAnchor
	} from '$lib/editor/viewportAnchor';
	import {
		allowedViewMode,
		defaultEditorSurface,
		defaultViewMode,
		isAuthorOnlyViewMode,
		isReadingViewMode,
		readEditorSurface,
		readViewMode,
		writeEditorSurface,
		writeViewMode,
		type EditorSurface,
		type ViewMode
	} from '$lib/view-mode';
	import { shouldShowDisplayTitle, headingPathLabel, isDisplayTitleSelector, type TitleSettings } from '$lib/title';
	import { NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';

	type User = { id: string; name: string; role: 'author' | 'reviewer'; highlightColor: string | null };

	let {
		slug,
		title,
		source,
		version,
		annotations,
		user,
		reviewers = [],
		grantedReviewerIds = [],
		titleSettings
	}: {
		slug: string;
		title: string;
		source: string;
		version: number;
		annotations: HydratableAnnotation[];
		user: User;
		reviewers?: AccessReviewer[];
		grantedReviewerIds?: string[];
		titleSettings: TitleSettings;
	} = $props();

	const DRAFT_ID = '__draft';
	let viewMode = $state<ViewMode>(defaultViewMode(user.role));
	let editorSurface = $state<EditorSurface>(defaultEditorSurface());

	let mount: HTMLDivElement | undefined = $state();
	let gutterEl: HTMLDivElement | undefined = $state();
	let editor: GlassineEditor | undefined;
	let editorGen = $state(0);
	let lastSavedSource = source;
	let pageTitle = $state(title);
	let commentBody = $state('');
	let commentOpen = $state(false);
	let replyTo = $state<string | null>(null);
	let commentBodies = $state<Record<string, string>>({});
	const commentSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const commentSaveSeq = new Map<string, number>();
	let status = $state('');
	let accessDialog: HTMLDialogElement | undefined = $state();
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
	let persistedQuotes: SuggestionQuote[] = [];
	let dirty = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let sse: EventSource | undefined;
	let seenVersion = $state(version);
	let savingOwnEdit = false;
	let applyingRemote = false;
	let pendingRemoteVersion: number | null = null;
	let applyingDecision = false;
	let persistChain: Promise<void> = Promise.resolve();
	let decisionStack: DecisionRecord[] = [];
	let decisionRedo: DecisionRecord[] = [];

	type DecisionRecord = {
		id: string;
		action: 'accept' | 'reject' | 'resolve';
		hideThreadIds: string[];
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
	let composeRange = $state<{ start: number; end: number; displayTitle?: boolean } | null>(null);
	const cardEls: Record<string, HTMLElement | undefined> = {};
	let layoutTimer: ReturnType<typeof setTimeout> | undefined;
	let viewportAnchor: ViewportAnchor | null = null;
	let selectionAnchor: { srcOffset: number | null; needle: string; needleAt: number } | null = null;
	let selectionHadFocus = false;
	let restoreEpoch = 0;
	let resolvedThreadIds = $state<string[]>([]);
	let dismissedIds = $state<string[]>([]);
	let tocItems = $state<TocItem[]>([]);
	let activeTocPos = $state<number | null>(null);

	const threads = $derived(
		annotations.filter(
			(a) => a.type === 'comment' && !a.parentId && a.status !== 'resolved' && !resolvedThreadIds.includes(a.id)
		)
	);
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
				item.type === 'suggestion' &&
				item.status !== 'accepted' &&
				item.status !== 'rejected' &&
				!resolvedThreadIds.includes(item.id) &&
				!dismissedIds.includes(item.id) &&
				(item.id === replyTo || repliesOf(item.id).some((reply) => reply.status !== 'resolved'))
		)
	);
	const detachedSuggestions = $derived(detached.filter((item) => item.type === 'suggestion'));
	const emphasizedIds = $derived.by(() => {
		const ids = new Set<string>([...hoveredCommentIds, ...caretCommentIds]);
		if (selectedCommentId) ids.add(selectedCommentId);
		return [...ids];
	});
	const reading = $derived(isReadingViewMode(viewMode));
	const sourceView = $derived(editorSurface === 'source');
	const tocBaseLevel = $derived(tocMinLevel(tocItems));
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
		editorSurface = readEditorSurface();
	});

	$effect(() => {
		pageTitle = title;
	});

	$effect(() => {
		const next = allowedViewMode(viewMode, user.role);
		if (next === viewMode) return;
		viewMode = next;
		writeViewMode(next);
	});

	$effect(() => {
		if (dirty) return;
		if (version < seenVersion) return;
		lastSavedSource = source;
	});

	$effect(() => {
		if (!mount) return;
		const pageSource = source;
		const pageVersion = version;
		const currentAnns = viewMode === 'reading' ? [] : annotations;
		const readingNow = isReadingViewMode(viewMode);
		const surfaceNow = editorSurface;
		const settingsNow = titleSettings;
		const userId = user.id;
		const highlightColor = user.highlightColor ?? '#7c9cff';
		const mountEl = mount;
		const skipped = untrack(() => new Set(dismissedIds));
		untrack(() => {
			if (!dirty && pageVersion >= seenVersion) lastSavedSource = pageSource;
		});
		const currentSource = untrack(() => lastSavedSource);
		const heading = shouldShowDisplayTitle(settingsNow, surfaceNow)
			? untrack(() => pageTitle)
			: null;
		const allowTitleEdit = user.role === 'author' && viewMode === 'editing';
		const hydrateAnns = currentAnns.filter((item) => !skipped.has(item.id));

		knownIds = new Set(hydrateAnns.map((a) => a.id));
		const instance = untrack(() =>
			createGlassineEditor({
				source: currentSource,
				annotations: hydrateAnns,
				surface: surfaceNow,
				mode: viewMode === 'editing' && user.role === 'author' ? 'edit' : readingNow ? 'edit' : 'suggest',
				editable: !readingNow,
				previewAccepted: viewMode === 'reading-modified',
				displayTitle: heading,
				allowTitleEdit,
				user: { id: userId, highlightColor },
				mount: mountEl,
				onUpdate(view, _parsed, tr) {
					if (editor?.view !== view) return;
					if (tr.docChanged) refreshToc();
					const next = liveCommentRanges(view.state);
					if (!sameCommentRanges(commentRanges, next)) commentRanges = next;
					updateSelected();
					const hist = historyMeta(tr);
					if (hist && !applyingDecision) {
						const matched = matchDecisionFromHistory(hist.redo);
						if (matched) {
							void enqueuePersist(() => commitDecision(matched.rec, matched.kind));
							queueRelayout();
							return;
						}
					}
					if (!tr.docChanged) return;
					queueRelayout();
					if (applyingDecision) return;
					if (applyingRemote) {
						if (viewMode === 'editing' && user.role === 'author') {
							editor.syncAuthorSource(tr);
						}
						dirty = true;
						return;
					}
					if (!hist) decisionRedo = [];
					if (viewMode === 'editing' && user.role === 'author') {
						if (!editor.syncAuthorSource(tr)) {
							status = 'Could not map that edit to the file';
						}
						dirty = true;
						if (hist) {
							clearTimeout(saveTimer);
							void enqueuePersist(async () => persistAuthorEdit());
						} else {
							queueSave();
						}
						return;
					}
					if (hist) {
						clearTimeout(saveTimer);
						dirty = true;
						void enqueuePersist(async () => persistSuggestions());
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
			resolvedThreadIds = [];
			detached = instance.detached;
			overlapping = instance.overlapping;
			attachedCommentIds = instance.attachedCommentIds ?? [];
			commentRanges = instance.getCommentRanges();
			editorGen += 1;
		});
		queueRelayout();
		untrack(() => {
			restoreViewportAnchor();
			restoreEditorSelection();
		});
		const lateLayout = setTimeout(() => {
			relayout();
			restoreViewportAnchor();
			restoreEditorSelection();
		}, 50);
		return () => {
			clearTimeout(lateLayout);
			clearTimeout(saveTimer);
			lastSavedSource = instance.parsed.source;
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
		const es = new EventSource(`/api/documents/${currentSlug}/events`);
		sse = es;
		const onRemoteVersion = (ev: Event) => {
			const data = JSON.parse((ev as MessageEvent).data) as { version?: number };
			if (typeof data.version !== 'number') return;
			noteRemoteVersion(data.version);
		};
		es.addEventListener('hello', onRemoteVersion);
		es.addEventListener('base-moved', onRemoteVersion);
		const poll = window.setInterval(() => {
			void (async () => {
				try {
					const res = await fetch(`/api/documents/${currentSlug}/version`);
					if (!res.ok) return;
					const data = (await res.json()) as { version?: number };
					if (typeof data.version === 'number') noteRemoteVersion(data.version);
				} catch {
					/* Vite restart or offline */
				}
			})();
		}, 1000);
		return () => {
			clearInterval(poll);
			es.close();
		};
	});

	$effect(() => {
		void editorGen;
		untrack(() => {
			refreshToc();
			updateSelected();
		});
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

	function refreshToc() {
		const doc = editor?.view.state.doc;
		tocItems = doc ? extractToc(doc) : [];
		updateActiveToc();
	}

	function chromeReadingLine(): number {
		const chrome = document.querySelector('.chrome');
		if (!(chrome instanceof HTMLElement)) return 72;
		const rect = chrome.getBoundingClientRect();
		if (document.documentElement.getAttribute('data-chrome-position') === 'bottom') return 16;
		return rect.bottom + 10;
	}

	function updateActiveToc() {
		if (!editor || !tocItems.length) {
			activeTocPos = null;
			return;
		}
		const threshold = chromeReadingLine();
		const tops: number[] = [];
		for (const item of tocItems) {
			try {
				tops.push(editor.view.coordsAtPos(item.pos + 1).top);
			} catch {
				tops.push(Number.POSITIVE_INFINITY);
			}
		}
		const index = pickActiveTocIndex(tops, threshold);
		activeTocPos = index == null ? null : (tocItems[index]?.pos ?? null);
	}

	function scrollToToc(item: TocItem) {
		if (!editor) return;
		try {
			const top = editor.view.coordsAtPos(item.pos + 1).top;
			window.scrollBy({ top: top - chromeReadingLine(), behavior: 'smooth' });
			activeTocPos = item.pos;
		} catch {
			// heading may have been removed
		}
	}

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
			void persistPendingEdits();
		}, 900);
	}

	function cancelPendingSave() {
		saveEpoch += 1;
		clearTimeout(saveTimer);
	}

	async function persistPendingEdits() {
		if (viewMode === 'suggesting') await persistSuggestions();
		else if (viewMode === 'editing' && user.role === 'author') await persistAuthorEdit();
	}

	function noteRemoteVersion(remoteVersion: number) {
		if (remoteVersion <= seenVersion) return;
		if (savingOwnEdit) {
			seenVersion = remoteVersion;
			return;
		}
		if (dirty) return;
		pendingRemoteVersion = Math.max(pendingRemoteVersion ?? 0, remoteVersion);
		void applyRemoteBase();
	}

	async function applyRemoteBase() {
		if (applyingRemote) return;
		applyingRemote = true;
		try {
			while (pendingRemoteVersion != null && pendingRemoteVersion > seenVersion) {
				pendingRemoteVersion = null;
				if (viewMode === 'suggesting') await persistSuggestions();
				cancelPendingSave();
				dirty = false;
				const epoch = captureRemountPosition();
				const mountEl = mount;
				const prevMin = mountEl?.style.minHeight ?? '';
				if (mountEl) mountEl.style.minHeight = `${Math.max(mountEl.offsetHeight, 1)}px`;
				try {
					await invalidateAll();
					await tick();
					seenVersion = Math.max(seenVersion, version);
					finishEditorRemount(epoch);
				} finally {
					if (mountEl) mountEl.style.minHeight = prevMin;
				}
			}
		} catch {
			status = 'Could not apply the latest document';
		} finally {
			applyingRemote = false;
			if (pendingRemoteVersion != null && pendingRemoteVersion > seenVersion) {
				void applyRemoteBase();
			}
		}
	}

	function captureRemountPosition() {
		viewportAnchor = captureViewportAnchor();
		selectionAnchor = captureEditorSelection();
		selectionHadFocus = editor?.view.hasFocus() ?? false;
		return ++restoreEpoch;
	}

	async function beginEditorRemount() {
		clearTimeout(saveTimer);
		await persistPendingEdits();
		return captureRemountPosition();
	}

	function finishEditorRemount(epoch: number) {
		if (epoch !== restoreEpoch) return;
		restoreViewportAnchor();
		restoreEditorSelection();
		requestAnimationFrame(() => {
			if (epoch !== restoreEpoch) return;
			restoreViewportAnchor();
			restoreEditorSelection();
		});
		setTimeout(() => {
			if (epoch !== restoreEpoch) return;
			restoreViewportAnchor();
			restoreEditorSelection();
			viewportAnchor = null;
			selectionAnchor = null;
			selectionHadFocus = false;
		}, 80);
	}

	async function setViewMode(mode: ViewMode) {
		const next = allowedViewMode(mode, user.role);
		if (next === viewMode) return;
		const epoch = await beginEditorRemount();
		if (isReadingViewMode(next)) {
			commentOpen = false;
			replyTo = null;
			composeRange = null;
			composeFrom = null;
		}
		writeViewMode(next);
		viewMode = next;
		await invalidateAll();
		finishEditorRemount(epoch);
	}

	async function setEditorSurface(surface: EditorSurface) {
		if (surface === editorSurface) return;
		const epoch = await beginEditorRemount();
		writeEditorSurface(surface);
		editorSurface = surface;
		finishEditorRemount(epoch);
	}

	function captureViewportAnchor(): ViewportAnchor | null {
		if (!editor || !mount) return null;
		const view = editor.view;
		const rect = mount.getBoundingClientRect();
		if (rect.height <= 0) return null;
		const visibleTop = Math.max(rect.top, 72);
		const visibleBottom = Math.min(rect.bottom, window.innerHeight - 56);
		if (visibleBottom <= visibleTop) return null;
		const y = visibleTop + Math.min(48, (visibleBottom - visibleTop) / 3);
		const x = rect.left + Math.min(Math.max(rect.width * 0.15, 16), 80);
		const hit = view.posAtCoords({ left: x, top: y });
		const pos = hit?.pos ?? Math.min(view.state.doc.content.size, view.state.selection.head);
		let viewportY = y;
		try {
			viewportY = view.coordsAtPos(pos).top;
		} catch {
			// keep the sampled viewport Y
		}
		const src = editor.parsed.map.docToSrc(pos);
		const snippet = snippetAroundPos(view.state.doc, pos);
		return {
			srcOffset: src?.offset ?? null,
			needle: snippet.needle,
			needleAt: snippet.needleAt,
			viewportY,
			fraction: rect.height ? (viewportY - rect.top) / rect.height : 0
		};
	}

	function restoreViewportAnchor() {
		if (!viewportAnchor || !editor || !mount) return;
		const anchor = viewportAnchor;
		const size = editor.view.state.doc.content.size;
		const pos = resolveAnchorPos(editor.view.state.doc, editor.parsed.map, anchor);
		if (pos != null && size > 0) {
			try {
				const coords = editor.view.coordsAtPos(Math.max(0, Math.min(pos, size)));
				const delta = scrollDelta(coords.top, anchor.viewportY);
				if (Math.abs(delta) >= 1) window.scrollBy(0, delta);
				return;
			} catch {
				// fall through to height-fraction restore
			}
		}
		const rect = mount.getBoundingClientRect();
		const delta = fractionScrollDelta(rect.top, mount.offsetHeight, anchor.fraction, anchor.viewportY);
		if (Math.abs(delta) >= 1) window.scrollBy(0, delta);
	}

	function captureEditorSelection() {
		if (!editor) return null;
		const head = editor.view.state.selection.head;
		const src = editor.parsed.map.docToSrc(head);
		const snippet = snippetAroundPos(editor.view.state.doc, head);
		return {
			srcOffset: src?.offset ?? null,
			needle: snippet.needle,
			needleAt: snippet.needleAt
		};
	}

	function restoreEditorSelection() {
		if (!selectionAnchor || !editor) return;
		const size = editor.view.state.doc.content.size;
		const pos = resolveAnchorPos(editor.view.state.doc, editor.parsed.map, selectionAnchor);
		if (pos == null || size <= 0) return;
		try {
			const resolved = editor.view.state.doc.resolve(Math.max(0, Math.min(pos, size)));
			const sel = TextSelection.near(resolved);
			const tr = editor.view.state.tr.setSelection(sel).setMeta('addToHistory', false);
			editor.view.dispatch(tr);
			if (selectionHadFocus) editor.view.focus();
		} catch {
			// selection may not resolve on a structurally different doc
		}
	}

	function updateSelected() {
		if (!editor) return;
		const sel = editor.view.state.selection;
		const { from, to } = sel;
		const footnoteMarker =
			sel instanceof NodeSelection && sel.node.type.name === 'footnote_ref';
		hasTextSelection = from !== to && !footnoteMarker;
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
		if (footnoteMarker) {
			if (menuKind === 'selection' && !hoveringSuggestionMenu) {
				scheduleCloseSuggestionMenu();
			}
			return;
		}
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
		const onPointerDown = (event: PointerEvent) => {
			const ids = commentIdsFromTarget(event.target);
			selectedCommentId = ids[0] ?? null;
			if (ids.length) return;
			if (!(event.target instanceof Element) || event.target.closest('.glassine-doc')) return;
			if (hoveredCommentIds.length) hoveredCommentIds = [];
			if (caretCommentIds.length) caretCommentIds = [];
		};
		el.addEventListener('mouseover', onOver);
		el.addEventListener('mouseout', onOut);
		window.addEventListener('pointerdown', onPointerDown);
		return () => {
			el.removeEventListener('mouseover', onOver);
			el.removeEventListener('mouseout', onOut);
			window.removeEventListener('pointerdown', onPointerDown);
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
		const live = editor.extractNewSuggestions(new Set());
		const existingById = new Map<string, SuggestionQuote>();
		for (const item of annotations) {
			if (item.type !== 'suggestion' || item.status !== 'open') continue;
			existingById.set(item.id, {
				id: item.id,
				authorId: item.authorId,
				replacement: item.replacement,
				exact: item.exact,
				prefix: item.prefix,
				suffix: item.suffix,
				offsetHint: item.offsetHint,
				headingPath: item.headingPath,
				paraOrdinal: item.paraOrdinal
			});
		}
		for (const item of persistedQuotes) {
			const row = annotations.find((ann) => ann.id === item.id);
			if (row && (row.type !== 'suggestion' || row.status !== 'open')) continue;
			existingById.set(item.id, item);
		}
		const { upserts, relabels } = persistableSuggestions({
			live,
			knownIds,
			existing: [...existingById.values()],
			userId: user.id,
			source: lastSavedSource,
			title: pageTitle
		});
		if (relabels.length) editor.relabelSuggestions(relabels);
		if (!upserts.length) {
			dirty = false;
			return;
		}
		const res = await fetch(`/api/documents/${slug}/annotations`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ suggestions: upserts })
		});
		if (epoch !== saveEpoch) return;
		if (res.ok) {
			for (const item of upserts) {
				knownIds.add(item.id);
				persistedQuotes = [
					...persistedQuotes.filter((row) => row.id !== item.id),
					{
						id: item.id,
						authorId: item.authorId,
						replacement: item.replacement,
						exact: item.exact,
						prefix: item.prefix,
						suffix: item.suffix,
						offsetHint: item.offsetHint,
						headingPath: item.headingPath,
						paraOrdinal: item.paraOrdinal
					}
				];
				const row = annotations.find((ann) => ann.id === item.id);
				if (row && row.type === 'suggestion') {
					row.replacement = item.replacement;
					row.exact = item.exact;
					row.prefix = item.prefix;
					row.suffix = item.suffix;
					row.offsetHint = item.offsetHint;
					row.headingPath = item.headingPath;
					row.paraOrdinal = item.paraOrdinal;
				}
			}
			status = 'Suggestions saved';
			dirty = false;
		} else {
			status = 'Could not save suggestions';
		}
	}

	async function persistAuthorEdit() {
		if (!editor || user.role !== 'author' || viewMode !== 'editing' || applyingRemote) return;
		const epoch = saveEpoch;
		const heading = editor.displayTitleText();
		const body = editorSurface === 'source' ? editor.serializeBaseSource() : editor.parsed.source;
		const titleDirty = Boolean(heading) && heading !== pageTitle;
		const bodyDirty = body !== lastSavedSource;
		if (!bodyDirty && !titleDirty) {
			dirty = false;
			return;
		}
		savingOwnEdit = true;
		try {
			if (bodyDirty) {
				const res = await fetch(`/api/documents/${slug}/save`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ content: body })
				});
				if (epoch !== saveEpoch || applyingRemote) return;
				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					status = (err as { message?: string }).message ?? 'Save failed';
					return;
				}
				const result = (await res.json()) as { version: number };
				lastSavedSource = body;
				seenVersion = result.version;
			}
			if (titleDirty) {
				const renamed = await persistDisplayTitle(heading || pageTitle);
				if (epoch !== saveEpoch || applyingRemote) return;
				if (!renamed) {
					status = 'Could not update title';
					return;
				}
			}
			status = 'Saved';
			dirty = false;
			if (titleDirty && titleSettings.source === 'yaml') await invalidateAll();
		} finally {
			savingOwnEdit = false;
		}
	}

	async function persistDisplayTitle(nextTitle: string) {
		if (!editor || user.role !== 'author' || viewMode !== 'editing') return false;
		const res = await fetch(`/api/documents/${slug}/title`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: nextTitle })
		});
		if (!res.ok) return false;
		const body = (await res.json()) as {
			title: string;
			version?: number;
			source?: string;
		};
		pageTitle = body.title;
		if (typeof body.source === 'string') {
			editor.retargetSource(body.source);
			lastSavedSource = body.source;
		}
		if (typeof body.version === 'number') seenVersion = body.version;
		return true;
	}

	async function submitComment() {
		if (!editor || !commentBody.trim()) return;
		await persistPendingEdits();
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
		const res = await fetch(`/api/documents/${slug}/annotations`, {
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
		await persistPendingEdits();
		await enqueuePersist(async () => {
			if (action === 'accept') savingOwnEdit = true;
			try {
				const res = await fetch(`/api/documents/${slug}/${action}`, {
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
				headingPath: row.headingPath,
				paraOrdinal: row.paraOrdinal,
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
		const hideThreadIds = repliesOf(id).length ? [id] : [];
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
				applied = editor.acceptLocalSuggestions([id], { history: 'event', hideThreadIds });
				if (sub && isDisplayTitleSelector(sub)) {
					try {
						pageTitle = applySubstitutions(pageTitle, [sub]).source;
					} catch {
						/* heading marks already applied */
					}
				} else if (sub) {
					try {
						sourceAfter = applySubstitutions(sourceBefore, [sub]).source;
						editor.retargetSource(sourceAfter);
						lastSavedSource = sourceAfter;
					} catch {
						/* marks are already applied; map can catch up on the next remount */
					}
				}
				if (typeof body.version === 'number') seenVersion = body.version;
				status = 'Accepted';
			} else {
				applied = editor.revertLocalSuggestion(id, { history: 'event', hideThreadIds });
				status = 'Rejected';
			}
		} finally {
			applyingDecision = false;
		}
		if (applied) {
			if (hideThreadIds.length) {
				resolvedThreadIds = [...new Set([...resolvedThreadIds, ...hideThreadIds])];
			}
			decisionStack = [
				...decisionStack,
				{
					id,
					action,
					hideThreadIds,
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
		dismissedIds = [...new Set([...dismissedIds, ...gone])];
		hideSuggestionMenu();
		updateSelected();
		queueRelayout();
	}

	function matchDecisionFromHistory(redo: boolean): { rec: DecisionRecord; kind: 'undo' | 'redo' } | null {
		if (!editor) return null;
		if (redo) {
			const rec = decisionRedo.at(-1);
			if (!rec) return null;
			if (rec.action === 'resolve') {
				if (!editor.isThreadHidden(rec.id)) return null;
				decisionRedo = decisionRedo.slice(0, -1);
				decisionStack = [...decisionStack, rec];
				hideDecisionUi(rec);
				return { rec, kind: 'redo' };
			}
			const ids = suggestionIdsInDoc(editor.view.state.doc);
			if (!rec || ids.has(rec.id)) return null;
			decisionRedo = decisionRedo.slice(0, -1);
			decisionStack = [...decisionStack, rec];
			hideDecisionUi(rec);
			if (rec.action === 'accept') {
				editor.retargetSource(rec.sourceAfter);
				lastSavedSource = rec.sourceAfter;
			}
			return { rec, kind: 'redo' };
		}
		const rec = decisionStack.at(-1);
		if (!rec) return null;
		if (rec.action === 'resolve') {
			if (editor.isThreadHidden(rec.id)) return null;
			decisionStack = decisionStack.slice(0, -1);
			decisionRedo = [...decisionRedo, rec];
			restoreDecisionUi(rec);
			return { rec, kind: 'undo' };
		}
		const ids = suggestionIdsInDoc(editor.view.state.doc);
		if (!ids.has(rec.id)) return null;
		decisionStack = decisionStack.slice(0, -1);
		decisionRedo = [...decisionRedo, rec];
		restoreDecisionUi(rec);
		if (rec.action === 'accept') {
			editor.retargetSource(rec.sourceBefore);
			lastSavedSource = rec.sourceBefore;
		}
		return { rec, kind: 'undo' };
	}

	function hideDecisionUi(rec: DecisionRecord) {
		const gone = new Set<string>([rec.id, ...rec.overlapping]);
		overlapping = overlapping.filter((item) => !gone.has(item.id));
		detached = detached.filter((item) => !gone.has(item.id));
		dismissedIds = [...new Set([...dismissedIds, ...gone])];
		if (rec.hideThreadIds?.length) {
			resolvedThreadIds = [...new Set([...resolvedThreadIds, ...rec.hideThreadIds])];
		}
		if (rec.action === 'resolve') {
			resolvedThreadIds = [...new Set([...resolvedThreadIds, rec.id])];
			attachedCommentIds = attachedCommentIds.filter((id) => id !== rec.id);
		}
	}

	function restoreDecisionUi(rec: DecisionRecord) {
		const back = new Set<string>([rec.id, ...rec.overlapping]);
		dismissedIds = dismissedIds.filter((id) => !back.has(id));
		const known = new Set(overlapping.map((item) => item.id));
		overlapping = [
			...overlapping,
			...rec.overlappingItems.filter((item) => !known.has(item.id))
		];
		const knownDetached = new Set(detached.map((item) => item.id));
		detached = [...detached, ...rec.detachedItems.filter((item) => !knownDetached.has(item.id))];
		const unhide = new Set([...(rec.hideThreadIds ?? []), rec.action === 'resolve' ? rec.id : '']);
		unhide.delete('');
		if (unhide.size) {
			resolvedThreadIds = resolvedThreadIds.filter((id) => !unhide.has(id));
			attachedCommentIds = [...new Set([...attachedCommentIds, ...unhide])];
		}
	}

	async function commitDecision(rec: DecisionRecord, kind: 'undo' | 'redo') {
		try {
			if (rec.action === 'resolve') {
				await postResolve(rec.id, kind !== 'undo');
				return;
			}
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
			const res = await fetch(`/api/documents/${slug}/unaccept`, {
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
		const res = await fetch(`/api/documents/${slug}/unreject`, {
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
			const res = await fetch(`/api/documents/${slug}/accept`, {
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
		const res = await fetch(`/api/documents/${slug}/reject`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ annotationId: id })
		});
		if (!res.ok) throw new Error('reject failed');
		status = 'Rejected';
	}

	async function postResolve(threadId: string, resolved: boolean) {
		const res = await fetch(`/api/documents/${slug}/resolve`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ threadId, resolved })
		});
		if (!res.ok) throw new Error('resolve failed');
		status = resolved ? 'Comment resolved' : 'Resolve undone';
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
		await persistPendingEdits();
		const range = editor.getSelectionSourceRange();
		if (!range) {
			status = 'Select a passage first, then re-attach';
			return;
		}
		const res = await fetch(`/api/documents/${slug}/annotations`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id, ...range })
		});
		if (!res.ok) {
			status = 'Re-attach failed';
			return;
		}
		const item = [...annotations, ...overlapping, ...detached].find((row) => row.id === id);
		const mapped = range.displayTitle
			? { from: 1 + range.start, to: 1 + range.end, linear: true }
			: editor.parsed.map.srcRangeToDoc(range.start, range.end);
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

	function commentText(item: HydratableAnnotation) {
		return commentBodies[item.id] ?? item.body ?? '';
	}

	function canEditComment(item: HydratableAnnotation) {
		return !reading && item.type === 'comment' && item.authorId === user.id;
	}

	function commentPlainText(node: HTMLElement) {
		return (node.innerText ?? node.textContent ?? '').replace(/\u00a0/g, ' ');
	}

	function restoreCommentText(node: HTMLElement, id: string, fallback: string) {
		const text = commentBodies[id] ?? fallback;
		if (commentPlainText(node) !== text) node.textContent = text;
	}

	async function persistCommentBody(id: string, raw: string, node?: HTMLElement, fallback = '') {
		const text = raw.trim();
		if (!text) {
			if (node) restoreCommentText(node, id, fallback);
			status = 'Comment cannot be empty';
			return;
		}
		if (text === (commentBodies[id] ?? fallback)) return;
		const seq = (commentSaveSeq.get(id) ?? 0) + 1;
		commentSaveSeq.set(id, seq);
		const res = await fetch(`/api/documents/${slug}/annotations`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id, body: text })
		});
		if (seq !== commentSaveSeq.get(id)) return;
		if (!res.ok) {
			status = 'Could not update comment';
			return;
		}
		commentBodies = { ...commentBodies, [id]: text };
		status = '';
	}

	function scheduleCommentSave(id: string, raw: string, node: HTMLElement, fallback: string) {
		const prev = commentSaveTimers.get(id);
		if (prev) clearTimeout(prev);
		commentSaveTimers.set(
			id,
			setTimeout(() => {
				commentSaveTimers.delete(id);
				void persistCommentBody(id, raw, node, fallback);
			}, 450)
		);
		queueRelayout();
	}

	function flushCommentSave(id: string, node: HTMLElement, fallback: string) {
		const prev = commentSaveTimers.get(id);
		if (prev) clearTimeout(prev);
		commentSaveTimers.delete(id);
		void persistCommentBody(id, commentPlainText(node), node, fallback);
	}

	function ownCommentEdit(node: HTMLElement, opts: { id: string; text: string; enabled: boolean }) {
		const apply = (next: typeof opts) => {
			opts = next;
			node.contentEditable = next.enabled ? 'true' : 'false';
			if (document.activeElement !== node && commentPlainText(node) !== next.text) {
				node.textContent = next.text;
			}
		};
		const onInput = () => scheduleCommentSave(opts.id, commentPlainText(node), node, opts.text);
		const onBlur = () => flushCommentSave(opts.id, node, opts.text);
		const onPaste = (event: ClipboardEvent) => {
			event.preventDefault();
			const text = event.clipboardData?.getData('text/plain') ?? '';
			document.execCommand('insertText', false, text);
		};
		const onKey = (event: KeyboardEvent) => event.stopPropagation();
		node.addEventListener('input', onInput);
		node.addEventListener('blur', onBlur);
		node.addEventListener('paste', onPaste);
		node.addEventListener('keydown', onKey);
		apply(opts);
		return {
			update(next: typeof opts) {
				apply(next);
			},
			destroy() {
				node.removeEventListener('input', onInput);
				node.removeEventListener('blur', onBlur);
				node.removeEventListener('paste', onPaste);
				node.removeEventListener('keydown', onKey);
				const prev = commentSaveTimers.get(opts.id);
				if (prev) clearTimeout(prev);
				commentSaveTimers.delete(opts.id);
				if (opts.enabled) void persistCommentBody(opts.id, commentPlainText(node), node, opts.text);
			}
		};
	}

	function resolveThread(id: string) {
		if (!editor || reading) return;
		applyingDecision = true;
		let applied = false;
		try {
			applied = editor.resolveThread(id, { history: 'event' });
		} finally {
			applyingDecision = false;
		}
		if (!applied) return;
		resolvedThreadIds = [...new Set([...resolvedThreadIds, id])];
		attachedCommentIds = attachedCommentIds.filter((item) => item !== id);
		if (selectedCommentId === id) selectedCommentId = null;
		if (replyTo === id) {
			replyTo = null;
			commentOpen = false;
		}
		decisionStack = [
			...decisionStack,
			{
				id,
				action: 'resolve',
				hideThreadIds: [id],
				overlapping: [],
				overlappingItems: [],
				detachedItems: [],
				rejectOverlapping: false,
				sourceBefore: editor.parsed.source,
				sourceAfter: editor.parsed.source
			}
		];
		decisionRedo = [];
		status = 'Comment resolved';
		queueRelayout();
		void enqueuePersist(() => postResolve(id, true));
	}
</script>

<svelte:window
	onresize={() => {
		queueRelayout();
		updateActiveToc();
	}}
	onscroll={updateActiveToc}
/>

<Chrome
	title={pageTitle}
	{user}
	{viewMode}
	onViewModeChange={setViewMode}
	{editorSurface}
	onEditorSurfaceChange={setEditorSurface}
	{status}
	downloadHref="/api/documents/{slug}/download"
	homeHref={user.role === 'author' ? '/admin' : '/'}
	onManageAccess={user.role === 'author' ? () => accessDialog?.showModal() : undefined}
/>

{#if user.role === 'author'}
	<ManageAccessDialog {reviewers} {grantedReviewerIds} {slug} bind:dialog={accessDialog} />
{/if}

<div class="document-shell" class:is-reading={reading}>
	{#if tocItems.length}
		<nav class="document-toc slim-scroll slim-scroll-start" aria-label="Table of contents">
			<h2>Contents</h2>
			<ol>
				{#each tocItems as item (item.pos)}
					<li style="padding-inline-start: {tocIndent(item.level, tocBaseLevel) * 0.85}rem">
						<button
							type="button"
							class:is-active={activeTocPos === item.pos}
							onclick={() => scrollToToc(item)}>{item.text}</button
						>
					</li>
				{/each}
			</ol>
		</nav>
	{/if}
	<div class="glassine-doc" class:is-reading={reading} class:is-source={sourceView} bind:this={mount}></div>
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
						{#if isAuthorOnlyViewMode(viewMode)}
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
					<div class="muted">{headingPathLabel(item.headingPath)}{item.paraOrdinal ? ` · paragraph ${item.paraOrdinal}` : ''}</div>
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
	<div class="comment-card-head">
		<div class="comment-author">{item.authorName || 'Unknown'}</div>
		<button
			type="button"
			class="comment-resolve"
			aria-label="Resolve thread"
			onmousedown={(event) => event.preventDefault()}
			onclick={(event) => {
				event.stopPropagation();
				resolveThread(item.id);
			}}
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
	</div>
	{#if item.type === 'suggestion'}
		{#if item.exact}<div class="quote">“{item.exact}”</div>{/if}
		{#if item.replacement}<p>{item.replacement}</p>{/if}
	{:else}
		{#if !attached}
			<div class="muted">{headingPathLabel(item.headingPath)}{item.paraOrdinal ? ` · paragraph ${item.paraOrdinal}` : ''}</div>
			<div class="quote">“{item.exact}”</div>
		{/if}
		{#if commentText(item) || canEditComment(item)}
				<p
				class:comment-text-editable={canEditComment(item)}
				role={canEditComment(item) ? 'textbox' : undefined}
				use:ownCommentEdit={{ id: item.id, text: commentText(item), enabled: canEditComment(item) }}
			></p>
		{/if}
	{/if}
	{#each repliesOf(item.id) as reply (reply.id)}
		<div class="comment-reply">
			<div class="comment-author">{reply.authorName || 'Unknown'}</div>
			{#if commentText(reply) || canEditComment(reply)}
				<p
					class:comment-text-editable={canEditComment(reply)}
					role={canEditComment(reply) ? 'textbox' : undefined}
					use:ownCommentEdit={{ id: reply.id, text: commentText(reply), enabled: canEditComment(reply) }}
				></p>
			{/if}
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
		<div class="row">
			<button type="button" onclick={() => startReply(item.id)}>Reply</button>
		</div>
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
