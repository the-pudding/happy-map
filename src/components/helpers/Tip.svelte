<script>
	import Button from "$components/ui/Button.svelte";
	import DollarSign from "@lucide/svelte/icons/dollar-sign";
	let { text = "Tip", href = "https://donate.stripe.com/00g03oaJRggE3zqeUW" } = $props();
</script>

<Button {href} target="_blank" rel="noreferrer">
	{text} <span><DollarSign color="currentColor" size={16} /></span>
</Button>

<style>
	span {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		margin-left: 0.25rem;
	}
</style>