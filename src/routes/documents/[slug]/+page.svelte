<script lang="ts">
	import DocumentEditor from '$lib/components/DocumentEditor.svelte';

	let { data } = $props();
</script>

<DocumentEditor
	slug={data.slug}
	title={data.title}
	source={data.source}
	version={data.version}
	annotations={data.annotations as import('$lib/editor').HydratableAnnotation[]}
	user={data.user}
/>
