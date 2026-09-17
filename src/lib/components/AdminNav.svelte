<script lang="ts">
	let { current }: { current: 'articles' | 'reviewers' | 'settings' } = $props();
</script>

<nav class="row" aria-label="Author">
	<a href="/admin" aria-current={current === 'articles' ? 'page' : undefined}>Articles</a>
	<a href="/admin/reviewers" aria-current={current === 'reviewers' ? 'page' : undefined}>Reviewers</a>
	<a href="/admin/settings" aria-current={current === 'settings' ? 'page' : undefined}>Settings</a>
</nav>
