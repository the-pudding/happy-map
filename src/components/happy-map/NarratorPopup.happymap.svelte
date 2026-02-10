<script>
  let { narratorPopupInfo = $bindable() } = $props();
  import Text from "$components/happy-map/Text.happymap.svelte";

  let popupElement = $state(null);
  let popupWidth = $state(0);
  let popupHeight = $state(0);

  // Measure popup dimensions after render
  $effect(() => {
    if (popupElement && narratorPopupInfo) {
      const rect = popupElement.getBoundingClientRect();
      popupWidth = rect.width;
      popupHeight = rect.height;
    }
  });
</script>
{#if narratorPopupInfo}
  {#key narratorPopupInfo.text}
    <div
      bind:this={popupElement}
      class="popup-container"
      style="left: {narratorPopupInfo.x}px; top: {narratorPopupInfo.y - (popupHeight || 0) - 20}px;"
    >
      <div class="popup-content">
        <Text copy={narratorPopupInfo.text} />
      </div>
    </div>
  {/key}
{/if}
<style>
  .popup-container {
    position: absolute;
    transform: translateX(-50%);
    z-index: 100;
    /* pointer-events: auto; */
    pointer-events: none;
  }
  .popup-content {
    background: var(--popupbg);
    color: var(--popuptext);
    padding: 10px 20px;
    border-radius: 4px;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.7);
    width: fit-content;
    min-width: 280px;
    max-width: min(440px, 98vw);
    font-family: var(--sans);
    font-size: 15px;
    position: relative;
  }
  .popup-content::after {
    content: "";
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 8px 8px 0;
    border-style: solid;
    border-color: var(--popupbg) transparent transparent transparent;
  }
  .popup-content :global(h1) {
    margin: 0 0 8px 0;
    /* font-size: 1.4em; */
    /* font-weight: 600; */
    font-size: 15px;
    font-weight: bold;
    font-family: var(--sans);
  }
  .popup-content :global(.byline) {
    font-size: 0.9em;
    color: #666;
  }
  .popup-content :global(a) {
    color: var(--hlcolor);
    text-decoration: none;
        pointer-events: auto;
  }
  .popup-content :global(a:hover) {
    text-decoration: underline;
  }
</style>
