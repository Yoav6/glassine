<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { notificationLine, relativeTime, type FeedItem } from '$lib/notify';

	let { onNavigate = undefined }: { onNavigate?: () => void } = $props();

	// The layout load gives a correct badge on every page; SSE and opening the
	// panel keep it fresh without a reload.
	let unread = $state(0);
	let items = $state<FeedItem[]>([]);
	let loading = $state(false);
	let open = $state(false);

	$effect(() => {
		unread = (page.data.unreadNotifications as number) ?? 0;
	});

	// Depend on the id, not the user object: `page.data` hands back a fresh
	// object on every navigation, which would tear down and rebuild the stream.
	const userId = $derived((page.data.user as { id?: string } | null)?.id ?? null);

	$effect(() => {
		if (!userId) return;
		const source = new EventSource('/api/notifications/events');
		source.addEventListener('notification', () => {
			unread += 1;
			if (open) void load();
		});
		return () => source.close();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch('/api/notifications');
			if (!res.ok) return;
			const data = await res.json();
			items = data.notifications ?? [];
			unread = data.unread ?? 0;
		} finally {
			loading = false;
		}
	}

	function onToggle(event: Event) {
		open = (event.currentTarget as HTMLDetailsElement).open;
		if (open) void load();
	}

	async function markAllRead() {
		const res = await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ all: true })
		});
		if (!res.ok) return;
		unread = 0;
		items = items.map((item) => ({ ...item, readAt: item.readAt ?? Date.now() }));
		await invalidateAll();
	}

	function href(item: FeedItem) {
		const target = item.threadId ?? item.annotationId;
		const base = `/documents/${encodeURIComponent(item.documentSlug)}`;
		return target ? `${base}?annotation=${encodeURIComponent(target)}` : base;
	}

	async function openItem(item: FeedItem) {
		onNavigate?.();
		if (item.readAt) return;
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids: [item.id] })
		});
	}
</script>

<details class="account-menu notif-menu" name="chrome-menu" ontoggle={onToggle}>
	<summary
		class="notif-summary"
		aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
	>
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path
				d="M8 2.2a3.6 3.6 0 0 0-3.6 3.6c0 3-1.1 4-1.1 4h9.4s-1.1-1-1.1-4A3.6 3.6 0 0 0 8 2.2ZM6.6 12.2a1.5 1.5 0 0 0 2.8 0"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		{#if unread}<span class="notif-badge">{unread > 99 ? '99+' : unread}</span>{/if}
	</summary>
	<div class="notif-panel">
		<div class="notif-head">
			<span class="account-menu-heading">Notifications</span>
			{#if unread}
				<button type="button" class="notif-mark" onclick={markAllRead}>Mark all read</button>
			{/if}
		</div>
		{#if loading && items.length === 0}
			<p class="muted notif-empty">Loading…</p>
		{:else if items.length === 0}
			<p class="muted notif-empty">Nothing yet.</p>
		{:else}
			<ul class="notif-list slim-scroll">
				{#each items as item (item.id)}
					<li class:notif-unread={!item.readAt}>
						<a href={href(item)} onclick={() => openItem(item)}>
							<span class="notif-text">{notificationLine(item.kind, item.actorName)}</span>
							<span class="notif-meta"
								>{item.documentTitle} · {relativeTime(item.createdAt)}</span
							>
						</a>
					</li>
				{/each}
			</ul>
			<a class="account-menu-link notif-all" href="/notifications" onclick={() => onNavigate?.()}
				>See all</a
			>
		{/if}
	</div>
</details>
