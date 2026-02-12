<script>
  let { narratorPopupInfo = $bindable() } = $props();
  import Text from "$components/happy-map/Text.happymap.svelte";

  let popupElement = $state(null);
  let popupHeight = $state(0);
  let isReady = $state(false);
  let currentText = $state("");

  // Reset ready state when text changes
  $effect(() => {
    if (narratorPopupInfo?.text !== currentText) {
      isReady = false;
      currentText = narratorPopupInfo?.text || "";
    }
  });

  // Wait for images to load, then measure and show
  $effect(() => {
    if (popupElement && narratorPopupInfo && !isReady) {
      const images = popupElement.querySelectorAll('img');

      if (images.length === 0) {
        // No images, measure immediately
        requestAnimationFrame(() => {
          const rect = popupElement.getBoundingClientRect();
          popupHeight = rect.height;
          isReady = true;
        });
      } else {
        // Wait for all images to load
        let loadedCount = 0;
        const totalImages = images.length;

        const checkAllLoaded = () => {
          loadedCount++;
          if (loadedCount >= totalImages) {
            requestAnimationFrame(() => {
              const rect = popupElement.getBoundingClientRect();
              popupHeight = rect.height;
              isReady = true;
            });
          }
        };

        images.forEach((img) => {
          if (img.complete) {
            checkAllLoaded();
          } else {
            img.addEventListener('load', checkAllLoaded, { once: true });
            img.addEventListener('error', checkAllLoaded, { once: true });
          }
        });
      }
    }
  });
</script>

{#if narratorPopupInfo}
  {#key narratorPopupInfo.text}
    <div
      bind:this={popupElement}
      class="popup-container"
      class:visible={isReady}
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
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .popup-container.visible {
    opacity: 1;
  }

  .popup-content {
    background: var(--narratorpopupbg);
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
    border-color: var(--narratorpopupbg) transparent transparent transparent;
  }

  .popup-content :global(h1) {
    margin: 0 0 0px 0;
    font-size: 20px;
    font-family: var(--handwriting);
  }

  .popup-content :global(.byline) {
    font-size: 1em;
    margin-top: -10px;
    color: #999;
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
