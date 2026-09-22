import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { FeedItem } from '$lib/notify';
import { db } from '../db';
import { document, notification, user } from '../db/schema';

export type { FeedItem };

export function unreadCount(userId: string): number {
	return db
		.select({ id: notification.id })
		.from(notification)
		.where(and(eq(notification.userId, userId), isNull(notification.readAt)))
		.all().length;
}

/** Newest first, joined to the names the bell needs to render a line. */
export function recentNotifications(userId: string, limit = 30): FeedItem[] {
	return db
		.select({
			id: notification.id,
			kind: notification.kind,
			createdAt: notification.createdAt,
			readAt: notification.readAt,
			actorName: user.name,
			documentTitle: document.title,
			documentSlug: document.slug,
			annotationId: notification.annotationId,
			threadId: notification.threadId
		})
		.from(notification)
		.leftJoin(user, eq(notification.actorId, user.id))
		.innerJoin(document, eq(notification.documentId, document.id))
		.where(eq(notification.userId, userId))
		.orderBy(desc(notification.createdAt))
		.limit(limit)
		.all()
		.map((row) => ({
			...row,
			createdAt: row.createdAt.getTime(),
			readAt: row.readAt?.getTime() ?? null,
			actorName: row.actorName ?? 'Someone'
		}));
}

export function markRead(userId: string, ids: string[]) {
	if (ids.length === 0) return;
	db.update(notification)
		.set({ readAt: new Date() })
		.where(
			and(eq(notification.userId, userId), isNull(notification.readAt), inArray(notification.id, ids))
		)
		.run();
}

export function markAllRead(userId: string) {
	db.update(notification)
		.set({ readAt: new Date() })
		.where(and(eq(notification.userId, userId), isNull(notification.readAt)))
		.run();
}

/**
 * Opening a thread reads everything it produced for this person. Matches on the
 * thread as well as the annotation, because a reply notification points at the
 * reply while the link points at the thread root.
 */
export function markReadForAnnotation(userId: string, id: string) {
	db.update(notification)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notification.userId, userId),
				isNull(notification.readAt),
				or(eq(notification.annotationId, id), eq(notification.threadId, id))
			)
		)
		.run();
}
