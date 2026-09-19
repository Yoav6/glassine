<script lang="ts">
	import Chrome from '$lib/components/Chrome.svelte';
	import AdminNav from '$lib/components/AdminNav.svelte';
	import { authClient } from '$lib/auth-client';
	import {
		currentChromePosition,
		currentTheme,
		setChromePosition,
		setTheme,
		type ChromePosition,
		type Theme
	} from '$lib/theme';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { TitleSource } from '$lib/title';

	let { data, form } = $props();
	let passkeyName = $state('');
	let error = $state('');
	let theme = $state<Theme>('dark');
	let chromePosition = $state<ChromePosition>('top');
	let titleSource = $state<TitleSource>('filename');
	let titleYamlProperty = $state('title');
	let gitCopied = $state(false);

	$effect(() => {
		theme = currentTheme();
		chromePosition = currentChromePosition();
	});

	$effect(() => {
		titleSource = data.title.source;
		titleYamlProperty = data.title.yamlProperty;
	});

	async function addPasskey() {
		error = '';
		const result = await authClient.passkey.addPasskey({
			name: passkeyName.trim() || 'Author key'
		});
		if (result.error) {
			error = result.error.message ?? 'Could not register passkey';
			return;
		}
		passkeyName = '';
		await invalidateAll();
	}

	async function copyGitCloneUrl() {
		if (!data.gitCloneUrl) return;
		await navigator.clipboard.writeText(data.gitCloneUrl);
		gitCopied = true;
		window.setTimeout(() => {
			gitCopied = false;
		}, 2000);
	}

	function applyTheme(next: Theme) {
		setTheme(next);
		theme = next;
	}

	function applyChromePosition(next: ChromePosition) {
		setChromePosition(next);
		chromePosition = next;
	}

	function formatAdded(iso: string | null) {
		if (!iso) return 'Unknown date';
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<Chrome title="Settings" user={data.user} homeHref="/admin" />
<main class="page stack" style="max-width:42rem">
	<AdminNav current="settings" />
	{#if form?.message}<p style="color:var(--danger)">{form.message}</p>{/if}
	{#if form?.saved}<p class="muted">Name saved.</p>{/if}
	{#if form?.renamed}<p class="muted">Passkey renamed.</p>{/if}
	{#if form?.deleted}<p class="muted">Passkey removed.</p>{/if}
	{#if form?.appearance}<p class="muted">Appearance saved.</p>{/if}

	<section class="card stack">
		<h2>Account</h2>
		<p class="muted">Email is the seeded author address and cannot be changed here.</p>
		<form method="POST" action="?/profile" use:enhance class="stack">
			<label class="stack">
				<span class="muted">Display name</span>
				<input name="name" value={data.user.name} required maxlength="80" />
			</label>
			<label class="stack">
				<span class="muted">Email</span>
				<input value={data.user.email} disabled />
			</label>
			<button class="primary" type="submit">Save name</button>
		</form>
	</section>

	<section class="card stack">
		<h2>Passkeys</h2>
		<p class="muted">
			Register a second authenticator (laptop, phone, or hardware key) so a lost device is not a
			lockout.
		</p>
		{#if data.passkeys.length === 0}
			<p class="muted">No passkeys yet.</p>
		{/if}
		{#each data.passkeys as key (key.id)}
			<div class="card stack">
				<form method="POST" action="?/rename" use:enhance class="row">
					<input type="hidden" name="id" value={key.id} />
					<input name="name" value={key.name || 'Passkey'} maxlength="80" aria-label="Passkey name" />
					<button type="submit">Rename</button>
				</form>
				<p class="muted">
					{key.deviceType === 'platform' ? 'This device' : 'Security key'}
					· added {formatAdded(key.createdAt)}
					{#if key.backedUp}· synced{/if}
				</p>
				<form method="POST" action="?/remove" use:enhance>
					<input type="hidden" name="id" value={key.id} />
					<button
						type="submit"
						disabled={data.passkeys.length <= 1 && !data.mail}
						title={data.passkeys.length <= 1 && !data.mail
							? 'Register another passkey before removing this one'
							: 'Remove this passkey'}
					>
						Remove
					</button>
				</form>
			</div>
		{/each}
		<div class="row">
			<input
				bind:value={passkeyName}
				placeholder="Laptop, phone, hardware key…"
				maxlength="80"
				aria-label="New passkey name"
			/>
			<button class="primary" type="button" onclick={addPasskey}>Register passkey</button>
		</div>
		{#if error}<p style="color:var(--danger)">{error}</p>{/if}
	</section>

	<section class="card stack">
		<h2>Appearance</h2>
		<p class="muted">Theme and bar placement are stored in this browser. Dark and top are the defaults.</p>
		<div class="row">
			<button type="button" aria-pressed={theme === 'dark'} onclick={() => applyTheme('dark')}
				>Dark</button
			>
			<button type="button" aria-pressed={theme === 'light'} onclick={() => applyTheme('light')}
				>Light</button
			>
		</div>
		<p class="muted">Navigation bar</p>
		<div class="row">
			<button
				type="button"
				aria-pressed={chromePosition === 'top'}
				onclick={() => applyChromePosition('top')}>Top</button
			>
			<button
				type="button"
				aria-pressed={chromePosition === 'bottom'}
				onclick={() => applyChromePosition('bottom')}>Bottom</button
			>
		</div>
		<form method="POST" action="?/appearance" use:enhance class="stack">
			<h3>Title</h3>
			<p class="muted">
				Used in the documents list and the browser tab. Stored on this instance. Missing headings or
				YAML values fall back to the file name.
			</p>
			<label class="row">
				<input type="radio" name="titleSource" value="filename" bind:group={titleSource} />
				File name
			</label>
			<label class="row">
				<input type="radio" name="titleSource" value="heading" bind:group={titleSource} />
				First heading
			</label>
			<label class="row">
				<input type="radio" name="titleSource" value="yaml" bind:group={titleSource} />
				YAML property
			</label>
			{#if titleSource === 'yaml'}
				<label class="stack">
					<span class="muted">Property name</span>
					<input
						name="titleYamlProperty"
						bind:value={titleYamlProperty}
						placeholder="title"
						required
						maxlength="64"
						pattern="[A-Za-z_][A-Za-z0-9_-]*"
					/>
				</label>
			{:else}
				<input type="hidden" name="titleYamlProperty" value={titleYamlProperty} />
			{/if}
			<button class="primary" type="submit">Save title</button>
		</form>
	</section>

	<section class="card stack">
		<h2>This instance</h2>
		<p>
			Git adapter:
			<strong>{data.git ? 'on' : 'off'}</strong>
		</p>
		<p class="muted">
			{#if data.git}
				Accepted edits commit to the local clone. Upload and download still work. Obsidian Git
				remote:
				<code>{data.gitRemote}</code>
				(user
				<code>{data.gitUser}</code>). Desktop Git has no password field — copy the URL that
				includes the HTTP token.
				{#if data.gitCloneUrl}
					<button type="button" onclick={copyGitCloneUrl}>
						{gitCopied ? 'Copied' : 'Copy remote with token'}
					</button>
					<span class="muted">Anyone with that URL can push markdown to this remote.</span>
				{/if}
			{:else}
				Upload and download still work. Enable with
				<code>npm run cli init-env --git</code>
				(or
				<code>--git --loopback</code>
				for Vite + git sidecar).
			{/if}
		</p>
		<p>
			Email recovery:
			<strong>{data.mail ? 'on' : 'off'}</strong>
		</p>
		<p class="muted">
			{#if data.mail}
				Email OTP is available on the sign-in page.
			{:else}
				Passkey is the only web login. Break-glass is
				<code>npm run cli author-setup-link</code>.
			{/if}
		</p>
		<p class="muted">Origin for passkeys: <code>{data.origin}</code></p>
	</section>
</main>

<style>
	h3 {
		margin: 0.5rem 0 0;
		font-size: 1.05rem;
	}

	input[type='radio'] {
		accent-color: var(--accent);
	}
</style>
