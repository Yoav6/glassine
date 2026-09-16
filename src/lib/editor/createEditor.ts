import { keymap } from 'prosemirror-keymap';
import { history, redo, undo } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
	enableSuggestChanges,
	suggestChanges,
	withSuggestChanges
} from '@handlewithcare/prosemirror-suggest-changes';
import { schema } from '$lib/md/schema';
import { parseMarkdown, type ParseResult } from '$lib/md';
import { commentDecorations } from './comments';
import { extractSuggestions } from './extract';
import { hydrateAnnotations, type HydratableAnnotation } from './hydrate';
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
	user: EditorUser;
	mount: HTMLElement;
	onUpdate?: (view: EditorView, parsed: ParseResult, docChanged: boolean) => void;
};

export type GlassineEditor = {
	view: EditorView;
	parsed: ParseResult;
	extractNewSuggestions: (knownIds: Set<string>) => ReturnType<typeof extractSuggestions>;
	getSelectionSourceRange: () => { start: number; end: number } | null;
	destroy: () => void;
	detached: HydratableAnnotation[];
	overlapping: HydratableAnnotation[];
};

export function createGlassineEditor(opts: CreateEditorOpts): GlassineEditor {
	const parsed = parseMarkdown(opts.source);
	const hydrated = hydrateAnnotations(
		EditorState.create({ schema, doc: parsed.doc }),
		parsed,
		opts.annotations
	);

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
		dispatchTransaction: withSuggestChanges(
			function (this: EditorView, tr) {
				this.updateState(this.state.apply(tr));
				opts.onUpdate?.(this, parsed, tr.docChanged);
			},
			() => crypto.randomUUID(),
			() => ({
				authorId: opts.user.id,
				highlightColor: opts.user.highlightColor
			}),
			(a, b) => a['authorId'] !== b['authorId']
		)
	});

	if (opts.mode === 'suggest') {
		enableSuggestChanges(view.state, view.dispatch.bind(view));
	}

	return {
		view,
		parsed,
		detached: hydrated.detached,
		overlapping: hydrated.overlapping,
		extractNewSuggestions(knownIds) {
			return extractSuggestions(view.state, parsed, knownIds);
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
		destroy() {
			view.destroy();
		}
	};
}
