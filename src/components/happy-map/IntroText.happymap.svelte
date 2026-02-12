<script>
  import Text from "$components/happy-map/Text.happymap.svelte";
  import copy from "$data/copy.json";
  import { onMount, onDestroy } from "svelte";

  let { introStage, onStep } = $props();
  const isExploreMode = $derived(introStage >= copy.story.length-1);

  let hasHover = $state(false);

  // --- NEW: Pressed State Logic ---
  let leftPressed = $state(false);
  let rightPressed = $state(false);

  function handleKeydown(e) {
    if (isExploreMode) return;
    if (e.key === "ArrowLeft") leftPressed = true;
    if (e.key === "ArrowRight") rightPressed = true;
  }

  function handleKeyup(e) {
    if (e.key === "ArrowLeft") leftPressed = false;
    if (e.key === "ArrowRight") rightPressed = false;
  }

  onMount(() => {
    hasHover = window.matchMedia("(hover: hover)").matches;
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("keyup", handleKeyup);
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("keyup", handleKeyup);
    }
  });
</script>

{#if isExploreMode}
  <button class="backToTour" onclick={() => onStep(-introStage)}
    >Back to story</button
  >
{:else}
  <div class="introText">
    <div class="buttonContainer">
      {#if introStage > 0}
        <button
          class="prev"
          class:active={leftPressed}
          onclick={() => onStep(-1)}
        >
          <span class="btn-content">
            {#if hasHover}<span class="key-hint">←</span>{/if}
            Back
          </span>
        </button>
      {/if}
      {#if introStage == 0}
        <button
          class="start"
          class:active={rightPressed}
          onclick={() => onStep(1)}
        >
          <span class="btn-content">
            Start
            {#if hasHover}<span class="key-hint">→</span>{/if}
          </span>
        </button>
      {:else if introStage < copy.story.length - 1}
        <button
          class="next"
          class:active={rightPressed}
          onclick={() => onStep(1)}
        >
          <span class="btn-content">
            Next
            {#if hasHover}<span class="key-hint">→</span>{/if}
          </span>
        </button>
      {:else}
        <button
          class="explore next"
          class:active={rightPressed}
          onclick={() => onStep(2)}
        >
          <span class="btn-content">
            Explore
            {#if hasHover}<span class="key-hint">→</span>{/if}
          </span>
        </button>
      {/if}
    </div>
  </div>
  <button class="skipBtn" onclick={() => onStep(2)}>Skip story</button>
{/if}

<style>
  .backToTour,
  .skipBtn {
    position: absolute;
    z-index: 9999;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0px;
    padding: 6px 12px;
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
    /* NEW: Disables double-tap zoom on mobile */
    touch-action: manipulation;
  }

  .backToTour:hover,
  .skipBtn:hover {
    background:
      repeating-linear-gradient(
        45deg,
        rgba(0, 100, 100, 0.2) 0px,
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
    /* Optional background for text readability if needed */
    /* background: rgba(255, 255, 255, 0.9); */
  }

  .introText :global(p) {
    font-size: 15px;
    line-height: 22px;
    font-family: var(--sans);
    margin-bottom: 15px;
  }

  .introText :global(a) {
    color: #eb8aff;
    text-decoration: none;
    border-bottom: 1px dotted #57bff2;
  }

  .introText :global(a:hover) {
    color: #68ddde;
    border-bottom: 1px solid #4da7a8;
  }

  .introText :global(.cite) {
    font-size: 11px;
    line-height: 14px;
    margin-top: 10px;
    margin-bottom: 15px;
    font-style: italic;
    opacity: 0.8;
  }

  .buttonContainer {
    width: 100%;
    height: 40px;
    position: relative;
    margin-top: 10px;
  }
  @media (max-width: 700px) {
    .buttonContainer {
      width: calc(100% - clamp(140px, 22vw, 180px));
      left: calc(clamp(140px, 22vw, 180px) / 2);
    }
  }

  .introText button {
    font-family: var(--handwriting);
    font-size: 16px;
    position: absolute;
    width: calc(50% - 5px);
    color: var(--buttontext);
    bottom: 0;
    height: 100%;
    background:
      repeating-linear-gradient(
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
    padding: 0;
    transition:
      transform 0.1s,
      box-shadow 0.1s,
      background 0.2s;
    touch-action: manipulation;
  }

  /* --- PRESSED STATE --- */
  /* Triggers on click (:active) or keyboard (.active) */
  .introText button:active,
  .introText button.active {
    transform: translateY(2px);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
    background: var(--buttonbg-hover);
  }

  /* Force content to center when pressed */
  .introText button:active .btn-content,
  .introText button.active .btn-content {
    transform: translateX(0) !important;
  }

  .introText button:hover {
    background:
      repeating-linear-gradient(
        45deg,
        var(--crosshatch) 0px,
        var(--crosshatch) 1px,
        transparent 1px,
        transparent 5px
      ),
      var(--buttonbg-hover);
  }

  /* --- BUTTON CONTENT WRAPPER --- */
  .btn-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  /* --- NUDGE ANIMATION --- */
  /* Prev: Nudge content slightly right (toward center) */
  .introText button.prev .btn-content {
    transform: translateX(3px);
  }

  /* Next: Nudge content slightly left (toward center) */
  .introText button.next .btn-content {
    transform: translateX(-3px);
  }

  /* Hover Container: Restore to true center */
  /*   .buttonContainer:hover button .btn-content {
    transform: translateX(0);
  } */

  /* --- KEY HINTS --- */
  .key-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    font-weight: bold;
    height: 18px;
    font-size: 11px;
    font-family: var(--sans);
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(0, 0, 0, 1);
    border-radius: 3px;
    color: var(--buttontext);
    opacity: 0.6;
    flex-shrink: 0;
    transition: opacity 0.2s;
  }

  .introText button:hover .key-hint {
    opacity: 1;
  }

  /* --- POSITIONS --- */
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
