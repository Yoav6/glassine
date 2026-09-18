import { keymap } from 'prosemirror-keymap';
import { closeHistory, history, redo, undo } from 'prosemirror-history';
import { baseKeymap, chainCommands, newlineInCode } from 'prosemirror-commands';
import { EditorState, type Command, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
	enableSuggestChanges,
	revertSuggestion,
	suggestChanges,
	withSuggestChanges
} from '@handlewithcare/prosemirror-suggest-changes';
import { schema } from '$lib/md/schema';
import { parseMarkdown, parseSource, serializeSourceDoc, type ParseResult } from '$lib/md';
import type { EditorSurface } from '$lib/view-mode';
import {
	applyCommentEmphasis,
	applyCommentRanges,
	commentDecorations,
	commentDecorationsKey,
	commentIdsAtSelection,
	hideThreadsOn,
	isThreadHidden,
	liveCommentRanges,
	sameIdList
} from './comments';
import { acceptSuggestionMarks, relabelSuggestionMarks } from './accept';
import { extractSuggestions, substitutionsFromTransaction } from './extract';
import {
	hydrateAnnotations,
	previewAcceptedDocument,
	type CommentRange,
	type HydratableAnnotation
} from './hydrate';
import { footnotes } from './footnotes';
import { editorLinks, linkMarkView } from './links';
import { joinPreview } from './joinPreview';
import {
	displayTitleEnd,
	displayTitleKeymap,
	displayTitlePlugin,
	displayTitleText,
	baseDisplayTitle,
	docPosToTitleOffset,
	withDisplayTitle
} from './displayTitle';

export type EditorMode = 'suggest' | 'edit';

export type HistoryMode = 'append' | 'event' | 'omit';

export type EditorUser = {
	id: string;
	highlightColor: string;
};

export type { EditorSurface } from '$lib/view-mode';

export type CreateEditorOpts = {
	source: string;
	annotations: HydratableAnnotation[];
	mode: EditorMode;
	surface?: EditorSurface;
	editable?: boolean;
	previewAccepted?: boolean;
	user: EditorUser;
	mount: HTMLElement;
	displayTitle?: string | null;
	allowTitleEdit?: boolean;
	onUpdate?: (view: EditorView, parsed: ParseResult, tr: Transaction) => void;
};

export type GlassineEditor = {
	view: EditorView;
	parsed: ParseResult;
	extractNewSuggestions: (knownIds: Set<string>) => ReturnType<typeof extractSuggestions>;
	substitutionsFromTransaction: (tr: Transaction) => ReturnType<typeof substitutionsFromTransaction>;
	relabelSuggestions: (pairs: { from: string; to: string }[]) => boolean;
	acceptLocalSuggestions: (ids: string[], opts?: { history?: HistoryMode; hideThreadIds?: string[] }) => boolean;
	revertLocalSuggestion: (id: string, opts?: { history?: HistoryMode; hideThreadIds?: string[] }) => boolean;
	resolveThread: (id: string, opts?: { history?: HistoryMode }) => boolean;
	isThreadHidden: (id: string) => boolean;
	retargetSource: (source: string) => void;
	serializeBaseSource: () => string;
	displayTitleText: () => string | null;
	getSelectionSourceRange: () => { start: number; end: number; displayTitle?: boolean } | null;
	getCommentRanges: () => ReturnType<typeof liveCommentRanges>;
	commentIdsAtSelection: () => string[];
	setEmphasizedComments: (ids: string[]) => void;
	attachCommentRange: (range: CommentRange) => void;
	destroy: () => void;
	detached: HydratableAnnotation[];
	overlapping: HydratableAnnotation[];
	attachedCommentIds: string[];
};

function withHistoryMode(tr: Transaction, mode: HistoryMode, previous: Transaction): Transaction {
	if (mode === 'omit') return tr.setMeta('addToHistory', false);
	if (mode === 'append') return tr.setMeta('appendedTransaction', previous);
	return closeHistory(tr);
}

function parseForSurface(
	source: string,
	surface: EditorSurface,
	displayTitle?: string | null
): ParseResult {
	const parsed = surface === 'source' ? parseSource(source) : parseMarkdown(source);
	if (displayTitle == null) return parsed;
	return withDisplayTitle(parsed, displayTitle);
}

const insertTab: Command = (state, dispatch) => {
	if (dispatch) dispatch(state.tr.insertText('\t'));
	return true;
};

export function createGlassineEditor(opts: CreateEditorOpts): GlassineEditor {
	const surface = opts.surface ?? 'article';
	const titleLabel = opts.displayTitle ?? null;
	let parsed = parseForSurface(opts.source, surface, titleLabel);
	const base = EditorState.create({ schema, doc: parsed.doc });
	const preview = opts.previewAccepted
		? previewAcceptedDocument(base, parsed, opts.annotations)
		: null;
	const hydrated = preview
		? {
				state: EditorState.create({ schema, doc: preview.doc }),
				inline: preview.inline,
				detached: preview.detached,
				overlapping: preview.overlapping,
				commentRanges: []
			}
		: hydrateAnnotations(base, parsed, opts.annotations);

	const plugins = [
		history(),
		keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }),
		...(titleLabel != null
			? [displayTitleKeymap(), displayTitlePlugin({ editable: Boolean(opts.allowTitleEdit) })]
			: []),
		...(surface === 'source'
			? [keymap({ Tab: insertTab, 'Shift-Tab': () => true, Enter: chainCommands(newlineInCode) })]
			: []),
		keymap(baseKeymap),
		suggestChanges(),
		...(surface === 'article' ? [joinPreview(), footnotes(), editorLinks()] : []),
		commentDecorations(hydrated.commentRanges)
	];

	const state = EditorState.create({
		schema,
		doc: hydrated.state.doc,
		plugins
	});

	const applyAndNotify = (view: EditorView, tr: Transaction) => {
		view.updateState(view.state.apply(tr));
		opts.onUpdate?.(view, parsed, tr);
	};

	const trackSuggestions = opts.mode === 'suggest' && opts.editable !== false;
	const view = new EditorView(opts.mount, {
		state,
		editable: () => opts.editable !== false,
		markViews: surface === 'article' ? { link: linkMarkView } : undefined,
		dispatchTransaction: trackSuggestions
			? withSuggestChanges(
					function (this: EditorView, tr) {
						applyAndNotify(this, tr);
					},
					() => crypto.randomUUID(),
					() => ({
						authorId: opts.user.id,
						highlightColor: opts.user.highlightColor
					}),
					(a, b) => a['authorId'] !== b['authorId']
				)
			: function (this: EditorView, tr) {
					applyAndNotify(this, tr);
				}
	});

	if (trackSuggestions) {
		enableSuggestChanges(view.state, view.dispatch.bind(view));
	}

	return {
		view,
		get parsed() {
			return parsed;
		},
		detached: hydrated.detached,
		overlapping: hydrated.overlapping,
		attachedCommentIds: hydrated.commentRanges.map((range) => range.id),
		extractNewSuggestions(knownIds) {
			return extractSuggestions(view.state, parsed, knownIds);
		},
		substitutionsFromTransaction(tr) {
			return substitutionsFromTransaction(tr, parsed);
		},
		relabelSuggestions(pairs) {
			const tr = relabelSuggestionMarks(view.state, pairs);
			if (!tr) return false;
			view.updateState(view.state.apply(tr));
			opts.onUpdate?.(view, parsed, tr);
			return true;
		},
		acceptLocalSuggestions(ids, historyOpts) {
			let tr = acceptSuggestionMarks(view.state, ids);
			const hideIds = historyOpts?.hideThreadIds ?? [];
			if (!tr && hideIds.length) tr = view.state.tr;
			if (!tr) return false;
			if (hideIds.length) tr = hideThreadsOn(tr, view.state, hideIds);
			const applied = withHistoryMode(tr, historyOpts?.history ?? 'append', view.state.tr);
			// Bypass withSuggestChanges: dispatching a mark-removal would be
			// rewritten into a new suggestion and the edit would stay pending.
			view.updateState(view.state.apply(applied));
			opts.onUpdate?.(view, parsed, applied);
			return true;
		},
		revertLocalSuggestion(id, historyOpts) {
			let applied = false;
			const hideIds = historyOpts?.hideThreadIds ?? [];
			revertSuggestion(id)(view.state, (tr) => {
				applied = true;
				if (hideIds.length) hideThreadsOn(tr, view.state, hideIds);
				withHistoryMode(tr, historyOpts?.history ?? 'append', view.state.tr);
				view.updateState(view.state.apply(tr));
				opts.onUpdate?.(view, parsed, tr);
			});
			if (!applied && hideIds.length) return this.resolveThread(hideIds[0]!, { history: historyOpts?.history });
			return applied;
		},
		resolveThread(id, historyOpts) {
			if (isThreadHidden(view.state, id)) return false;
			const tr = hideThreadsOn(view.state.tr, view.state, [id]);
			const applied = withHistoryMode(tr, historyOpts?.history ?? 'event', view.state.tr);
			view.updateState(view.state.apply(applied));
			opts.onUpdate?.(view, parsed, applied);
			return true;
		},
		isThreadHidden(id) {
			return isThreadHidden(view.state, id);
		},
		retargetSource(source) {
			const label = displayTitleText(view.state.doc) ?? titleLabel;
			parsed = parseForSurface(source, surface, label);
		},
		serializeBaseSource() {
			return serializeSourceDoc(view.state.doc);
		},
		displayTitleText() {
			return displayTitleText(view.state.doc);
		},
		getSelectionSourceRange() {
			const { from, to } = view.state.selection;
			if (from === to) return null;
			const titleEnd = displayTitleEnd(view.state.doc);
			if (titleEnd && from < titleEnd) {
				const title = baseDisplayTitle(view.state.doc);
				const start = Math.min(title.length, docPosToTitleOffset(from));
				const endOff = Math.min(title.length, Math.max(start, docPosToTitleOffset(to)));
				return { start, end: endOff, displayTitle: true };
			}
			const a = parsed.map.docToSrc(from);
			const b = parsed.map.docToSrc(Math.max(from, to - 1));
			if (!a || !b) return null;
			const start = Math.min(a.offset, b.offset);
			const end = Math.max(a.offset, b.offset) + 1;
			return { start, end };
		},
		getCommentRanges() {
			return liveCommentRanges(view.state);
		},
		commentIdsAtSelection() {
			return commentIdsAtSelection(view.state);
		},
		setEmphasizedComments(ids) {
			const current = commentDecorationsKey.getState(view.state)?.emphasized;
			if (current && sameIdList([...current], ids)) return;
			const tr = applyCommentEmphasis(view.state.tr, ids);
			// Bypass withSuggestChanges so emphasis meta is not rewritten.
			// Do not call onUpdate: rebuilding decorations is not a document edit.
			view.updateState(view.state.apply(tr));
		},
		attachCommentRange(range) {
			const next = [...liveCommentRanges(view.state).filter((item) => item.id !== range.id), range];
			const tr = applyCommentRanges(view.state.tr, next);
			view.updateState(view.state.apply(tr));
			opts.onUpdate?.(view, parsed, tr);
		},
		destroy() {
			view.destroy();
		}
	};
}
