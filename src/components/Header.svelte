<script>
	// shadow, plain, line, bubble
	import wordmark from "$svg/wordmark-bubble.svg";
</script>

<header>
	<div class="wordmark">
		<a href="https://pudding.cool" aria-label="The Pudding" target="_self"
			>{@html wordmark}</a
		>
	</div>
</header>

<style>
	header {
		display: block;
		position: absolute;
		z-index: 999999;
	}
	.wordmark {
		max-width: 14em;
		margin-left: 20px;
		padding: 32px 0;
		transform: rotate(-4deg);
	}

	.wordmark a {
		border: none;
		display: block;
		color: var(--color-fg);
	}

	.wordmark a:hover {
		background-color: transparent;
	}
</style>
