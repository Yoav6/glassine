<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();
</script>

<Chrome title="Devices" user={data.user} homeHref="/admin" />
<main class="page stack" style="max-width:44rem">
	<AdminNav current="devices" />
	<p class="muted">
		Devices paired through the sync API (see documentation/sync-api.md) — for example an Obsidian
		vault running the sync plugin. A device keeps its access until you revoke it here; there's no
		separate timeout.
	</p>

	{#if data.devices.length === 0}
		<p class="muted">No devices paired yet.</p>
	{:else}
		{#each data.devices as device (device.id)}
			<section class="card row">
				<div class="stack" style="gap:0.15rem; flex:1; min-width:0">
					<strong>{device.name}</strong>
					<span class="muted">
						Paired {device.createdAt.toLocaleString()}
						{#if device.revokedAt}
							· revoked {device.revokedAt.toLocaleString()}
						{:else if device.lastUsedAt}
							· last used {device.lastUsedAt.toLocaleString()}
						{:else}
							· never used
						{/if}
					</span>
				</div>
				{#if !device.revokedAt}
					<form
						method="POST"
						action="?/revoke"
						use:enhance={({ cancel }) => {
							if (!confirm(`Revoke "${device.name}"? It will lose access immediately.`)) cancel();
						}}
					>
						<input type="hidden" name="deviceId" value={device.id} />
						<button class="danger" type="submit">Revoke</button>
					</form>
				{/if}
			</section>
		{/each}
	{/if}
</main>

<style>
	button.danger {
		color: var(--danger);
	}
</style>
