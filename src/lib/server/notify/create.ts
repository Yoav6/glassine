import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { selectRecipients, type NotificationKind } from '$lib/notify';
import { db } from '../db';
import { annotation, notification, user } from '../db/schema';
import { newId } from '../crypto';
import { grantScopes } from '../reviewers';
import { broadcast, userChannel } from '../sse';

type Target = {
	documentId: string;
	actorId: string;
	kind: NotificationKind;
	annotationId?: string | null;
	threadId?: string | null;
};

function everyone() {
	return db.select({ id: user.id, role: user.role }).from(user).all();
}

/** Distinct people who have written in a thread: the root's author and every replier. */
function threadParticipants(threadId: string) {
	const rows = db
		.select({ authorId: annotation.authorId })
		.from(annotation)
		.where(or(eq(annotation.id, threadId), eq(annotation.parentId, threadId)))
		.all();
	const ids = [...new Set(rows.map((row) => row.authorId))];
	const people = everyone();
	return ids.flatMap((id) => {
		const person = people.find((row) => row.id === id);
		return person ? [person] : [];
	});
}

function write(recipients: string[], target: Target) {
	if (recipients.length === 0) return;
	const now = new Date();
	for (const userId of recipients) {
		db.insert(notification)
			.values({
				id: newId(),
				userId,
				actorId: target.actorId,
				kind: target.kind,
				documentId: target.documentId,
				annotationId: target.annotationId ?? null,
				threadId: target.threadId ?? null,
				createdAt: now,
				readAt: null,
				emailStatus: null,
				emailedAt: null
			})
			.run();
		// Nudges an open tab to refresh its bell. Best effort: the badge is also
		// loaded fresh on every page load.
		broadcast(userChannel(userId), 'notification', { kind: target.kind });
	}
}

/**
 * A reviewer left a new top-level comment or suggestion: the authors hear about
 * it. Top-level annotations by an author notify nobody — that would mail every
 * granted reviewer during an author's own pass.
 */
export function notifyAnnotation(opts: {
	documentId: string;
	actorId: string;
	actorRole: 'author' | 'reviewer';
	kind: 'comment' | 'suggestion';
	annotationIds: string[];
}) {
	if (opts.actorRole === 'author' || opts.annotationIds.length === 0) return;
	const authors = everyone().filter((row) => row.role === 'author');
	const recipients = selectRecipients({
		candidates: authors,
		actorId: opts.actorId,
		grants: grantScopes(opts.documentId),
		everyone: everyone()
	});
	for (const annotationId of opts.annotationIds) {
		write(recipients, {
			documentId: opts.documentId,
			actorId: opts.actorId,
			kind: opts.kind,
			annotationId,
			threadId: null
		});
	}
}

/** A reply reaches everyone already in the thread who is allowed to see the replier. */
export function notifyReply(opts: {
	documentId: string;
	actorId: string;
	replyId: string;
	threadId: string;
}) {
	const recipients = selectRecipients({
		candidates: threadParticipants(opts.threadId),
		actorId: opts.actorId,
		grants: grantScopes(opts.documentId),
		everyone: everyone()
	});
	write(recipients, {
		documentId: opts.documentId,
		actorId: opts.actorId,
		kind: 'reply',
		annotationId: opts.replyId,
		threadId: opts.threadId
	});
}

/**
 * Accepted, rejected or resolved. These are passenger kinds: they show up in the
 * bell immediately, but on their own they never cause an email — they are
 * summarised inside the next email a comment or reply triggers.
 */
export function notifyStatusChange(opts: {
	documentId: string;
	actorId: string;
	kind: 'accepted' | 'rejected' | 'resolved';
	annotationId: string;
}) {
	const row = db.select().from(annotation).where(eq(annotation.id, opts.annotationId)).get();
	if (!row) return;
	const candidates =
		opts.kind === 'resolved'
			? threadParticipants(row.parentId ?? row.id)
			: everyone().filter((person) => person.id === row.authorId);
	const recipients = selectRecipients({
		candidates,
		actorId: opts.actorId,
		grants: grantScopes(opts.documentId),
		everyone: everyone()
	});
	write(recipients, {
		documentId: opts.documentId,
		actorId: opts.actorId,
		kind: opts.kind,
		annotationId: opts.annotationId,
		threadId: row.parentId ?? row.id
	});
}

/**
 * Drops a still-queued accepted/rejected notification when the author undoes it.
 * Reporting "accepted" and then "un-accepted" in one digest reads as churn; the
 * honest summary of an accept that was reverted is silence.
 */
export function withdrawStatusNotifications(documentId: string, annotationIds: string[]) {
	if (annotationIds.length === 0) return;
	db.delete(notification)
		.where(
			and(
				eq(notification.documentId, documentId),
				isNull(notification.emailStatus),
				isNull(notification.readAt),
				inArray(notification.kind, ['accepted', 'rejected']),
				inArray(notification.annotationId, annotationIds)
			)
		)
		.run();
}
