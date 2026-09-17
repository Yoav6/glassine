import { keymap } from 'prosemirror-keymap';
import { history, redo, undo } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { enableSuggestChanges, suggestChanges, withSuggestChanges } from '@handlewithcare/prosemirror-suggest-changes';
import { schema } from '$lib/md/schema';
import { parseMarkdown, type ParseResult } from '$lib/md';
import {
	applyCommentEmphasis,
	commentDecorations,
	commentDecorationsKey,
	commentIdsAtSelection,
	liveCommentRanges,
	sameIdList
} from './comments';
import { acceptSuggestionMarks } from './accept';
import { extractSuggestions, substitutionsFromTransaction } from './extract';
import { hydrateAnnotations, previewAcceptedDocument, type HydratableAnnotation } from './hydrate';
import { joinPreview } from './joinPreview';

export type EditorMode = 'suggest' | 'edit';

export type EditorUser = {
	id: string;
	highlightColor: string;
};

export type CreateEditorOpts = {
	source: string;
	annotations: HydratableAnnotation[];
	mode: EditorMode;
	editable?: boolean;
	previewAccepted?: boolean;
	user: EditorUser;
	mount: HTMLElement;
	onUpdate?: (view: EditorView, parsed: ParseResult, tr: Transaction) => void;
};

export type GlassineEditor = {
	view: EditorView;
	parsed: ParseResult;
	extractNewSuggestions: (knownIds: Set<string>) => ReturnType<typeof extractSuggestions>;
	substitutionsFromTransaction: (tr: Transaction) => ReturnType<typeof substitutionsFromTransaction>;
	acceptLocalSuggestions: (ids: string[]) => void;
	retargetSource: (source: string) => void;
	getSelectionSourceRange: () => { start: number; end: number } | null;
	getCommentRanges: () => ReturnType<typeof liveCommentRanges>;
	commentIdsAtSelection: () => string[];
	setEmphasizedComments: (ids: string[]) => void;
	destroy: () => void;
	detached: HydratableAnnotation[];
	overlapping: HydratableAnnotation[];
	attachedCommentIds: string[];
};

export function createGlassineEditor(opts: CreateEditorOpts): GlassineEditor {
	let parsed = parseMarkdown(opts.source);
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
		keymap(baseKeymap),
		suggestChanges(),
		joinPreview(),
		commentDecorations(hydrated.commentRanges)
	];

	const state = EditorState.create({
		schema,
		doc: hydrated.state.doc,
		plugins
	});

	const view = new EditorView(opts.mount, {
		state,
		editable: () => opts.editable !== false,
		dispatchTransaction: withSuggestChanges(
			function (this: EditorView, tr) {
				this.updateState(this.state.apply(tr));
				opts.onUpdate?.(this, parsed, tr);
			},
			() => crypto.randomUUID(),
			() => ({
				authorId: opts.user.id,
				highlightColor: opts.user.highlightColor
			}),
			(a, b) => a['authorId'] !== b['authorId']
		)
	});

	if (opts.mode === 'suggest' && opts.editable !== false) {
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
		acceptLocalSuggestions(ids) {
			const tr = acceptSuggestionMarks(view.state, ids);
			if (!tr) return;
			const applied = tr.setMeta('appendedTransaction', view.state.tr);
			// Bypass withSuggestChanges: dispatching a mark-removal would be
			// rewritten into a new suggestion and the edit would stay pending.
			view.updateState(view.state.apply(applied));
			opts.onUpdate?.(view, parsed, applied);
		},
		retargetSource(source) {
			parsed = parseMarkdown(source);
		},
		getSelectionSourceRange() {
			const { from, to } = view.state.selection;
			if (from === to) return null;
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
		destroy() {
			view.destroy();
		}
	};
}
