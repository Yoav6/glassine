<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { notificationLine, relativeTime } from '$lib/notify';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const unread = $derived(data.notifications.filter((item) => !item.readAt).length);

	function href(item: PageData['notifications'][number]) {
		const target = item.threadId ?? item.annotationId;
		const base = `/documents/${encodeURIComponent(item.documentSlug)}`;
		return target ? `${base}?annotation=${encodeURIComponent(target)}` : base;
	}
</script>

<Chrome title="Notifications" user={data.user} />

<main class="page stack">
	<div class="row notif-page-head">
		<h1>Notifications</h1>
		{#if unread}
			<form method="POST" action="?/readAll">
				<button type="submit">Mark all read</button>
			</form>
		{/if}
	</div>

	{#if data.notifications.length === 0}
		<p class="muted">Nothing yet. Comments, suggestions and replies show up here.</p>
	{:else}
		<ul class="notif-list notif-page-list">
			{#each data.notifications as item (item.id)}
				<li class:notif-unread={!item.readAt}>
					<a href={href(item)}>
						<span class="notif-text">{notificationLine(item.kind, item.actorName)}</span>
						<span class="notif-meta">{item.documentTitle} · {relativeTime(item.createdAt)}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
