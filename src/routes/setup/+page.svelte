<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let error = $state('');
	let ready = $state(false);

	async function redeem() {
		error = '';
		try {
			const res = await fetch('/api/auth/invite/redeem', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: data.token, next: '/setup' }),
				signal: AbortSignal.timeout(10_000)
			});
			if (!res.ok) {
				error = 'Setup link invalid or already used.';
				return;
			}
			ready = true;
		} catch {
			error = 'Setup link invalid or already used.';
		}
	}

	async function enroll() {
		error = '';
		const result = await authClient.passkey.addPasskey({ name: 'Author key' });
		if (result.error) error = result.error.message ?? 'Could not register passkey';
		else await goto('/admin');
	}
</script>

<Chrome title="Author setup" />
<main class="page stack">
	<h1>Finish author setup</h1>
	{#if data.token && !data.enrolled && !ready}
		<p class="muted">Redeem this one-shot setup link, then register a passkey.</p>
		<button class="primary" type="button" onclick={redeem}>Redeem setup link</button>
	{:else}
		<p class="muted">Register a passkey on this device. Add another later from Settings so a lost phone is not a lockout.</p>
		<button type="button" class="primary" onclick={enroll}>Register passkey</button>
	{/if}
	{#if error}<p style="color:var(--danger)">{error}</p>{/if}
</main>
