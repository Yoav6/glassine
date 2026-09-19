<script lang="ts">
	let { current }: { current: 'documents' | 'assets' | 'reviewers' | 'settings' } = $props();
</script>

<nav class="row" aria-label="Author">
	<a href="/admin" aria-current={current === 'documents' ? 'page' : undefined}>Documents</a>
	<a href="/admin/assets" aria-current={current === 'assets' ? 'page' : undefined}>Assets</a>
	<a href="/admin/reviewers" aria-current={current === 'reviewers' ? 'page' : undefined}>Reviewers</a>
	<a href="/admin/settings" aria-current={current === 'settings' ? 'page' : undefined}>Settings</a>
</nav>
