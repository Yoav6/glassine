<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<Chrome title="Pair a device" user={data.user} homeHref="/admin" />
<main class="page stack" style="max-width:32rem">
	{#if !data.code || !data.deviceName}
		<p class="muted">
			This pairing link is invalid or has expired. Start pairing again from the device you're
			connecting.
		</p>
	{:else if form?.approved}
		<p>
			<strong>{data.deviceName}</strong> is paired. Go back to it — it should pick up its device
			token automatically.
		</p>
	{:else}
		<section class="card stack">
			<p>Allow <strong>{data.deviceName}</strong> to sync selected documents with this Glassine instance?</p>
			<p class="muted">
				It will be able to read and write documents you mark for sync, until you revoke it from
				Admin → Devices.
			</p>
			<form method="POST" action="?/approve" use:enhance>
				<input type="hidden" name="code" value={data.code} />
				<button class="primary" type="submit">Approve</button>
			</form>
			{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
		</section>
	{/if}
</main>
