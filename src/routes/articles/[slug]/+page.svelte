<script lang="ts">
	import ArticleEditor from '$lib/components/ArticleEditor.svelte';

	let { data } = $props();
</script>

<ArticleEditor
	slug={data.slug}
	title={data.title}
	source={data.source}
	version={data.version}
	annotations={data.annotations as import('$lib/editor').HydratableAnnotation[]}
	user={data.user}
/>
