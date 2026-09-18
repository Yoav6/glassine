<script lang="ts">
	import DocumentEditor from '$lib/components/DocumentEditor.svelte';
	import InviteLanding from '$lib/components/InviteLanding.svelte';

	let { data, form } = $props();
</script>

{#if data.inviteToken}
	<InviteLanding title="Open document" {form} />
{:else}
	<DocumentEditor
		slug={data.slug}
		title={data.title}
		titleSettings={data.titleSettings}
		source={data.source}
		version={data.version}
		annotations={data.annotations as import('$lib/editor').HydratableAnnotation[]}
		user={data.user!}
		reviewers={data.reviewers}
		grantedReviewerIds={data.grantedReviewerIds}
	/>
{/if}
