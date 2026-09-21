<script lang="ts">
	import DocumentEditor from '$lib/components/DocumentEditor.svelte';
	import InviteLanding from '$lib/components/InviteLanding.svelte';
	import { inviteRedeemAction } from '$lib/invite';

	let { data, form } = $props();
</script>

{#if data.inviteToken}
	<InviteLanding
		title="Open document"
		action={inviteRedeemAction(data.inviteToken, 'redeem')}
		{form}
	/>
{:else}
	<DocumentEditor
		slug={data.slug}
		title={data.title}
		titleSettings={data.titleSettings}
		source={data.source}
		version={data.version}
		annotations={data.annotations as import('$lib/editor').HydratableAnnotation[]}
		annotationSources={data.annotationSources}
		repliedThreadIds={data.repliedThreadIds}
		user={data.user!}
		reviewers={data.reviewers}
		authors={data.authors}
		grantedReviewerIds={data.grantedReviewerIds}
		grantScopes={data.grantScopes}
		grantCustomScopes={data.grantCustomScopes}
	/>
{/if}
