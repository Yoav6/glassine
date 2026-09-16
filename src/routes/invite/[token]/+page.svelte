<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let message = $state('');
	let busy = $state(false);

	async function redeem() {
		busy = true;
		message = '';
		try {
			const res = await fetch('/api/auth/invite/redeem', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: data.token, next: data.next }),
				signal: AbortSignal.timeout(10_000)
			});
			if (!res.ok) {
				message = 'This invite is invalid or has been rotated.';
				return;
			}
			await goto(data.next);
		} catch {
			message = 'This invite is invalid or has been rotated.';
		} finally {
			busy = false;
		}
	}
</script>

<Chrome title="Open reviews" />
<main class="page stack">
	<h1>Open my reviews</h1>
	<p class="muted">This confirms the invite in a POST so a mail scanner cannot mint a session.</p>
	<button class="primary" type="button" onclick={redeem} disabled={busy}>Continue</button>
	{#if message}<p style="color:var(--danger)">{message}</p>{/if}
</main>
