<script>
  import Text from "$components/happy-map/Text.happymap.svelte";
  import copy from "$data/copy.json";
  let { introStage, onStep } = $props();

  const isExploreMode = $derived(introStage >= copy.story.length);
</script>

{#if isExploreMode}
  <button class="backToTour" onclick={() => onStep(-introStage)}>Back to tour</button>
{:else}
  <div class="introText">
    <button class="closeBtn" onclick={() => onStep(2)} aria-label="Skip to explore">×</button>
    <Text copy={copy.story[introStage].text} />
    <div class="buttonContainer">
      {#if introStage > 0}
        <button class="prev" onclick={() => onStep(-1)}>Back</button>
      {/if}
      {#if introStage == 0}
        <button class="start" onclick={() => onStep(1)}>Start</button>
      {:else if introStage < copy.story.length - 1}
        <button class="next" onclick={() => onStep(1)}>Next</button>
      {:else}
        <button class="explore next" onclick={() => onStep(2)}>Explore</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backToTour {
    position: absolute;
    z-index: 999999;
    left: 50%;
    transform: translateX(-50%);
    bottom: 12px;
    padding: 8px 20px;
    font-family: var(--handwriting);
    font-size: 14px;
    color: black;
    background: var(--color-textbg);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 20px;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.2s ease;
  }

  .backToTour:hover {
    opacity: 1;
    background: repeating-linear-gradient(
        45deg,
        rgba(0, 100, 100, 0.2) 0px,
        rgba(0, 0, 0, 0.2) 1px,
        transparent 1px,
        transparent 5px
      ),
      repeating-linear-gradient(
        -45deg,
        rgba(0, 0, 0, 0.2) 0px,
        rgba(0, 0, 0, 0.2) 1px,
        transparent 1px,
        transparent 5px
      ),
      var(--color-textbg);
  }

  .introText {
    position: absolute;
    z-index: 999999;
    left: 50%;
    transform: translateX(-50%);
    bottom: 20px;
    width: 420px;
    max-width: calc(100% - 40px);
    padding: 20px;
    font-family: var(--handwriting);
    color: black;
    background: var(--color-textbg);
    border-radius: 10px;
  }

  .closeBtn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 20px;
    line-height: 1;
    color: rgba(0, 0, 0, 0.4);
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .closeBtn:hover {
    color: rgba(0, 0, 0, 0.7);
    background: rgba(0, 0, 0, 0.1);
  }

  .introText :global(p) {
    font-size: 15px;
    line-height: 22px;
    font-family: var(--sans);
  }

  .introText :global(a) {
    color: #eb8aff;
    text-decoration: none;
    border-bottom: 1px dotted #57bff2;
  }

  .introText :global(a:hover) {
    color: #68ddde;
    text-decoration: none;
    border-bottom: 1px solid #4da7a8;
  }

  .introText :global(.introSpan) {
    color: #ffec70;
  }

  .introText :global(.cite) {
    font-size: 11px;
    line-height: 14px;
    margin-top: 10px;
    color: #8db1b3;
    font-style: italic;
  }

  .buttonContainer {
    width: 100%;
    height: 40px;
    margin-top: 10px;
    position: relative;
  }

  .introText button:not(.closeBtn) {
    font-family: var(--handwriting);
    font-size: 16px;
    position: absolute;
    width: calc(50% - 5px);
    color: black;
    bottom: 0;
    height: 100%;
    background: repeating-linear-gradient(
        45deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 1px,
        transparent 1px,
        transparent 5px
      ),
      repeating-linear-gradient(
        -45deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 1px,
        transparent 1px,
        transparent 5px
      ),
      var(--color-textbg);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 20px;
    cursor: pointer;
  }

  .introText button:not(.closeBtn):hover {
    background: repeating-linear-gradient(
        45deg,
        rgba(0, 100, 100, 0.2) 0px,
        rgba(0, 0, 0, 0.2) 1px,
        transparent 1px,
        transparent 5px
      ),
      repeating-linear-gradient(
        -45deg,
        rgba(0, 0, 0, 0.2) 0px,
        rgba(0, 0, 0, 0.2) 1px,
        transparent 1px,
        transparent 5px
      ),
      var(--color-textbg);
    border: 1px solid rgba(0, 0, 0, 0.5);
  }

  .introText button.start {
    right: 25%;
    width: 50%;
  }

  .introText button.next {
    right: 0;
  }

  .introText button.prev {
    left: 0;
  }
</style>
