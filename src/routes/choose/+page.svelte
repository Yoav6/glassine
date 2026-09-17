<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import { accountLabel } from '$lib/accounts';
	import { writeTabAccountId } from '$lib/tab-account';

	let { data, form } = $props();
</script>

<Chrome title="Choose account" />
<main class="page stack">
	<h1>Choose an account</h1>
	<p class="muted">
		This device has more than one login. Pick who you are for this tab. Reloading keeps the choice;
		closing the tab or opening a new one asks again.
	</p>
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	<div class="stack">
		{#each data.accounts as account (account.id)}
			<form method="POST" action="?/activate" onsubmit={() => writeTabAccountId(account.id)}>
				<input type="hidden" name="userId" value={account.id} />
				<input type="hidden" name="next" value={data.next} />
				<button class="account-choice" type="submit" aria-label={accountLabel(account)}>
					<span>{account.name}</span>
					<span class="muted">{account.role === 'author' ? 'Author' : 'Reviewer'}</span>
				</button>
			</form>
		{/each}
	</div>
	<p class="muted">
		<a href="/login">Sign in as author with a passkey</a>
		or open a reviewer invite link for someone else.
	</p>
</main>
