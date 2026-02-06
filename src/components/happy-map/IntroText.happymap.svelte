<script>
  import Text from "$components/happy-map/Text.happymap.svelte";
  import copy from "$data/copy.json";
  let { introStage, onStep } = $props();
  const isExploreMode = $derived(introStage >= copy.story.length);

  // Detect if device has hover (likely desktop)
  let hasHover = $state(false);
  import { onMount } from 'svelte';
  onMount(() => {
    hasHover = window.matchMedia('(hover: hover)').matches;
  });
</script>

{#if isExploreMode}
  <button class="backToTour" onclick={() => onStep(-introStage)}>Back to tour</button>
{:else}
  <div class="introText">
    <div class="buttonContainer">
      {#if introStage > 0}
        <button class="prev" onclick={() => onStep(-1)}>
          {#if hasHover}<span class="key-hint">←</span>{/if}
          Back
        </button>
      {/if}
      {#if introStage == 0}
        <button class="start" onclick={() => onStep(1)}>
          Start
          {#if hasHover}<span class="key-hint">→</span>{/if}
        </button>
      {:else if introStage < copy.story.length - 1}
        <button class="next" onclick={() => onStep(1)}>
          Next
          {#if hasHover}<span class="key-hint">→</span>{/if}
        </button>
      {:else}
        <button class="explore next" onclick={() => onStep(2)}>
          Explore
          {#if hasHover}<span class="key-hint">→</span>{/if}
        </button>
      {/if}
    </div>
  </div>
  <button class="skipBtn" onclick={() => onStep(2)}>Skip</button>
{/if}

<style>
  .backToTour,
  .skipBtn {
    position: absolute;
    z-index: 9999;
    left: 50%;
    transform: translateX(-50%);
    bottom: -4px;
    padding: 8px 10px;
    font-family: var(--handwriting);
    font-size: 14px;
    color: var(--buttontext);
    background: var(--buttonbg);
    border: var(--buttonborder);
    border-radius: 20px 20px 0 0;
    cursor: pointer;
    opacity: 1;
    transition: opacity 0.2s ease;
    box-shadow: var(--buttonboxshadow);
  }

  .introText button {
    font-family: var(--handwriting);
    font-size: 16px;
    position: absolute;
    width: calc(50% - 5px);
    color: var(--buttontext);
    bottom: 0;
    height: 100%;
    background: repeating-linear-gradient(
        45deg,
        var(--crosshatch) 0px,
        var(--crosshatch) 1px,
        transparent 1px,
        transparent 5px
      ),
      repeating-linear-gradient(
        -45deg,
        var(--crosshatch) 0px,
        var(--crosshatch) 1px,
        transparent 1px,
        transparent 5px
      ),
      var(--buttonbg);
    border: var(--buttonborder);
    border-radius: 20px;
    cursor: pointer;
    box-shadow: var(--buttonboxshadow);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .key-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    font-size: 11px;
    font-family: var(--sans);
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    color: var(--buttontext);
    opacity: 0.6;
    flex-shrink: 0;
  }

  /* Add invisible spacer on opposite side to keep text centered */
  .introText button.prev::after,
  .introText button.next::before,
  .introText button.start::before {
    content: '';
    width: 6px;
    flex-shrink: 0;
  }

  .backToTour:hover,
  .skipBtn:hover {
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
      var(--buttonbg-hover);
  }

  .introText {
    position: absolute;
    z-index: 999999;
    left: 50%;
    transform: translateX(-50%);
    bottom: 20px;
    width: 360px;
    max-width: calc(100% - 40px);
    padding: 20px;
    font-family: var(--handwriting);
    color: black;
    border-radius: 10px;
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
    font-style: italic;
  }

  .buttonContainer {
    width: 100%;
    height: 40px;
    position: relative;
  }

  .introText button:hover {
    background: repeating-linear-gradient(
        45deg,
        var(--crosshatch) 0px,
        var(--crosshatch) 1px,
        transparent 1px,
        transparent 5px
      ),
      repeating-linear-gradient(
        -45deg,
        var(--crosshatch) 0px,
        var(--crosshatch) 1px,
        transparent 1px,
        transparent 5px
      ),
      var(--buttonbg-hover);
    border: var(--buttonborder);
  }

  .introText button:hover .key-hint {
    opacity: 1;
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
