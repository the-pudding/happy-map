<script>
	import { getContext } from "svelte";
	import Footer from "$components/Footer.svelte";
	import HappyMap from "$components/happy-map/Main.happymap.svelte";

	// const copy = getContext("copy");
	// const data = getContext("data");
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<HappyMap />
	<!-- <Footer recirc={true} /> -->
</svelte:boundary>
