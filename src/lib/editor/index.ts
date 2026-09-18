export { createGlassineEditor, type GlassineEditor, type CreateEditorOpts, type EditorMode, type EditorSurface } from './createEditor';
export {
	extractSuggestions,
	persistableSuggestions,
	substitutionsFromTransaction,
	type ExtractedSuggestion,
	type SuggestionQuote
} from './extract';
export {
	hydrateAnnotations,
	previewAcceptedDocument,
	type HydratableAnnotation,
	type CommentRange,
	type HydrateResult
} from './hydrate';
export { stackCommentTops, type CommentLayoutItem } from './commentLayout';
export { commentIdsFromTarget, hideThreadsOn, isThreadHidden, liveCommentRanges, sameCommentRanges, sameIdList } from './comments';
export { extractToc, pickActiveTocIndex, tocIndent, tocMinLevel, type TocItem } from './toc';
export {
	SUGGESTION_MENU_CLOSE_MS,
	SUGGESTION_MENU_OPEN_MS,
	canActOnSuggestion,
	parseSuggestionDomId,
	shouldKeepSuggestionMenu,
	suggestionBounds,
	suggestionFromTarget,
	suggestionIdsInDoc,
	suggestionMenuPosition,
	type SuggestionHit
} from './suggestions';
