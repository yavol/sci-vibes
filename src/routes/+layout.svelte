<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Sci Vibes — Human-steered auto-research</title>
	<meta
		name="description"
		content="A local control room for comparing, steering, and evaluating parallel scientific research branches."
	/>
</svelte:head>

{@render children()}
