<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let email = $state('');
	let otp = $state('');
	let sent = $state(false);
	let error = $state('');

	async function passkey() {
		error = '';
		const result = await authClient.signIn.passkey({
			fetchOptions: {
				onSuccess() {
					void goto('/');
				}
			}
		});
		if (result.error) error = result.error.message ?? 'Passkey sign-in failed';
	}

	async function sendOtp() {
		error = '';
		const result = await authClient.emailOtp.sendVerificationOtp({
			email,
			type: 'sign-in'
		});
		if (result.error) error = result.error.message ?? 'Could not send code';
		else sent = true;
	}

	async function verifyOtp() {
		const result = await authClient.signIn.emailOtp({ email, otp });
		if (result.error) error = result.error.message ?? 'Invalid code';
		else await goto('/');
	}
</script>

<Chrome title="Sign in" />
<main class="page stack">
	<h1>Author sign in</h1>
	<p class="muted">Reviewers use the invite link they were given. This page is for the author passkey.</p>
	<button type="button" class="primary" onclick={passkey}>Sign in with passkey</button>
	{#if data.mail}
		<p class="muted">Or recover with a one-time code to the seeded author email.</p>
		<input type="email" bind:value={email} placeholder="you@example.com" autocomplete="username webauthn" />
		{#if !sent}
			<button type="button" onclick={sendOtp}>Email a code</button>
		{:else}
			<input bind:value={otp} placeholder="Code" />
			<button type="button" class="primary" onclick={verifyOtp}>Verify</button>
		{/if}
	{/if}
	{#if error}<p class="muted" style="color:var(--danger)">{error}</p>{/if}
</main>
