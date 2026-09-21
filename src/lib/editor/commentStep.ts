import { Step, StepMap, StepResult } from 'prosemirror-transform';
import type { CommentRange } from './hydrate';

export class CommentResolveStep extends Step {
	constructor(
		readonly threadId: string,
		readonly range: CommentRange | null,
		readonly hide: boolean
	) {
		super();
	}

	apply(doc: Parameters<Step['apply']>[0]) {
		return StepResult.ok(doc);
	}

	invert() {
		return new CommentResolveStep(this.threadId, this.range, !this.hide);
	}

	map(mapping: Parameters<Step['map']>[0]) {
		if (!this.range) return this;
		const from = mapping.mapResult(this.range.from, 1);
		const to = mapping.mapResult(this.range.to, -1);
		if (from.deleted && to.deleted) {
			return new CommentResolveStep(this.threadId, null, this.hide);
		}
		return new CommentResolveStep(
			this.threadId,
			{ ...this.range, from: from.pos, to: Math.max(from.pos, to.pos) },
			this.hide
		);
	}

	getMap() {
		return StepMap.empty;
	}

	merge() {
		return null;
	}

	toJSON() {
		return {
			stepType: 'commentResolve',
			threadId: this.threadId,
			range: this.range,
			hide: this.hide
		};
	}

	static fromJSON(_schema: unknown, json: { threadId: string; range?: CommentRange | null; hide: boolean }) {
		return new CommentResolveStep(json.threadId, json.range ?? null, json.hide);
	}
}

// prosemirror-transform is externalized in SSR, so its step registry outlives this module.
// When Vite's module runner re-evaluates this file (dev invalidation), the ID is already taken.
try {
	Step.jsonID('commentResolve', CommentResolveStep);
} catch (err) {
	if (!(err instanceof RangeError)) throw err;
	(CommentResolveStep.prototype as { jsonID?: string }).jsonID = 'commentResolve';
}
