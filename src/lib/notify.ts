import { parseScope, visibleAuthorIds } from './access';

/**
 * What happened. The split matters: a TRIGGERING kind can cause an email to be
 * sent, a passenger kind only ever rides along inside an email that something
 * else triggered. That is what keeps an accept-and-resolve session from mailing
 * anyone, while still telling them about it the next time they hear from us.
 */
export type NotificationKind =
	| 'comment'
	| 'suggestion'
	| 'reply'
	| 'accepted'
	| 'rejected'
	| 'resolved';

export const TRIGGERING_KINDS = new Set<string>(['comment', 'suggestion', 'reply']);

export function isTriggering(kind: string): boolean {
	return TRIGGERING_KINDS.has(kind);
}

export type NotifyPerson = { id: string; role: string };

/**
 * Who may be told that `actorId` did something on this document.
 *
 * This is the notification side of the isolation invariant: a reviewer is only a
 * recipient when the actor's annotations are ones they could have read anyway.
 * Without this check, "Bob replied" leaks Bob's participation to a reviewer whose
 * scope hides him.
 */
export function selectRecipients(opts: {
	/** People in the running: thread participants, or the authors. */
	candidates: NotifyPerson[];
	actorId: string;
	/** candidateId -> grant.visibilityScope. A missing entry means no grant. */
	grants: Record<string, string | null | undefined>;
	/** Everyone on the instance, for resolving a `default` scope to the authors. */
	everyone: NotifyPerson[];
}): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const candidate of opts.candidates) {
		// Nobody is notified of their own action.
		if (candidate.id === opts.actorId) continue;
		if (seen.has(candidate.id)) continue;
		seen.add(candidate.id);
		if (candidate.role === 'author') {
			out.push(candidate.id);
			continue;
		}
		const scope = opts.grants[candidate.id];
		// No grant means no access to the document at all.
		if (scope == null) continue;
		const visible = visibleAuthorIds(parseScope(scope), candidate.id, opts.everyone);
		if (visible.has(opts.actorId)) out.push(candidate.id);
	}
	return out;
}

export type PendingRow = {
	id: string;
	kind: string;
	createdAt: number;
	readAt: number | null;
};

export type PacingConfig = {
	quietMs: number;
	maxDelayMs: number;
	minGapMs: number;
	staleMs: number;
};

export type PacingState = {
	lastEmailAt: number | null;
	nextAttemptAt: number | null;
};

export type DigestPlan = {
	/** Rows to put in an email now. Empty means send nothing. */
	send: string[];
	/** Rows the recipient already read in-app; close them, never mail them. */
	markRead: string[];
	/** Rows too old to be worth mailing; close them without sending. */
	markStale: string[];
};

const EMPTY: DigestPlan = { send: [], markRead: [], markStale: [] };

/**
 * Decides what to do with one recipient's outbox.
 *
 * The quiet window is what collapses a burst: while the actor is still working,
 * `now - newest` stays small and nothing goes out, so twenty-six annotations
 * become one email once they stop. `maxDelayMs` stops a continuously active
 * reviewer from deferring it forever.
 */
export function planDigest(
	now: number,
	pending: PendingRow[],
	state: PacingState,
	config: PacingConfig
): DigestPlan {
	// A failed batch is left completely alone until its backoff expires, so the
	// same rows are retried rather than partly closed out.
	if (state.nextAttemptAt != null && now < state.nextAttemptAt) return EMPTY;

	const markRead: string[] = [];
	const markStale: string[] = [];
	const fresh: PendingRow[] = [];
	for (const row of pending) {
		if (row.readAt != null) markRead.push(row.id);
		else if (now - row.createdAt >= config.staleMs) markStale.push(row.id);
		else fresh.push(row);
	}

	const triggers = fresh.filter((row) => isTriggering(row.kind));
	if (triggers.length === 0) return { send: [], markRead, markStale };

	const newest = Math.max(...triggers.map((row) => row.createdAt));
	const oldest = Math.min(...triggers.map((row) => row.createdAt));
	const settling = now - newest < config.quietMs && now - oldest < config.maxDelayMs;
	if (settling) return { send: [], markRead, markStale };

	if (state.lastEmailAt != null && now - state.lastEmailAt < config.minGapMs) {
		return { send: [], markRead, markStale };
	}

	return { send: fresh.map((row) => row.id), markRead, markStale };
}

/** Exponential, capped. Attempt 1 waits a minute; attempt 8 waits about two hours. */
export function backoffMs(attempts: number): number {
	return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 2 * 60 * 60_000);
}

export const MAX_ATTEMPTS = 8;

/** One row as the bell and the full list render it. */
export type FeedItem = {
	id: string;
	kind: string;
	createdAt: number;
	readAt: number | null;
	actorName: string;
	documentTitle: string;
	documentSlug: string;
	annotationId: string | null;
	threadId: string | null;
};

/** One line of bell text. Shared so the panel and the full list never drift. */
export function notificationLine(kind: string, actorName: string): string {
	switch (kind) {
		case 'reply':
			return `${actorName} replied to a thread`;
		case 'suggestion':
			return `${actorName} suggested an edit`;
		case 'comment':
			return `${actorName} left a comment`;
		case 'accepted':
			return `${actorName} accepted your suggestion`;
		case 'rejected':
			return `${actorName} rejected your suggestion`;
		case 'resolved':
			return `${actorName} resolved a thread`;
		default:
			return `${actorName} made a change`;
	}
}

/** "just now", "5m", "3h", "2d" — enough for a notification list. */
export function relativeTime(then: number, now = Date.now()): string {
	const secs = Math.max(0, Math.round((now - then) / 1000));
	if (secs < 45) return 'just now';
	const mins = Math.round(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}
