export { createGlassineEditor, type GlassineEditor, type CreateEditorOpts, type EditorMode } from './createEditor';
export { extractSuggestions, substitutionsFromTransaction, type ExtractedSuggestion } from './extract';
export {
	hydrateAnnotations,
	previewAcceptedDocument,
	type HydratableAnnotation,
	type CommentRange,
	type HydrateResult
} from './hydrate';
export { stackCommentTops, type CommentLayoutItem } from './commentLayout';
export { commentIdsFromTarget, hideThreadsOn, isThreadHidden, liveCommentRanges, sameCommentRanges, sameIdList } from './comments';
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
