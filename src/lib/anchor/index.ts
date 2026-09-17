export { buildSelector, CONTEXT_CHARS, type TextQuoteSelector } from './selector';
export { resolveSelector, type ResolveResult, type ResolvedRange } from './resolve';
export {
	applySubstitution,
	applySubstitutions,
	invertSubstitution,
	ApplyError,
	type Substitution
} from './apply';
export { retargetSelector, mapRangeThroughSplice, type Splice } from './retarget';
