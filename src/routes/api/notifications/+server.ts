import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { markAllRead, markRead, recentNotifications, unreadCount } from '$lib/server/notify/read';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const user = requireUser(event);
	return json({
		notifications: recentNotifications(user.id),
		unread: unreadCount(user.id)
	});
};

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const body = await event.request.json();
	if (body.all) markAllRead(user.id);
	else if (Array.isArray(body.ids)) markRead(user.id, body.ids.map(String));
	return json({ ok: true, unread: unreadCount(user.id) });
};
