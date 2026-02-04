<script>
  import Text from "$components/happy-map/Text.happymap.svelte";
  import copy from "$data/copy.json";

  let { introStage, onStep } = $props();
</script>

<div class="introText">
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

<style>

  .introText {
    position: absolute;
    z-index: 999999;
    left: 50%;
    transform: translateX(-50%);
    bottom: 20px;
    width: 420px;
    max-width: calc(100% - 40px);
    padding: 20px;


    /* Font settings */
    font-family: var(--handwriting);
    color: black;

    /* 1. Remove the default background (the ::before element will handle it) */
    background: var(--color-textbg);
    border-radius: 10px;
  }





  .introText :global(p) {
    font-size: 15px;
    line-height: 22px;
    /* color: #dff4f5; */
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

  .introText button {
    font-family: var(--handwriting);
    font-size: 16px;
    position: absolute;
    width: calc(50% - 5px);
    color: black;
    bottom: 0;
    height: 100%;

    /* --- THE CROSSHATCH BACKGROUND --- */
    /* We stack 3 layers. The top two are the white lines, the bottom is the blue. */
    background:
    /* Layer 1: Diagonal stripes (45 degrees) - thin white lines with low opacity */
      repeating-linear-gradient(
        45deg,
        rgba(0, 0, 0, 0.1) 0px,
        /* Start white line */ rgba(0, 0, 0, 0.1) 1px,
        /* End white line (1px thick) */ transparent 1px,
        /* Start gap */ transparent 5px /* End gap (7px spacing) */
      ),
      /* Layer 2: Opposite diagonal stripes (-45 degrees) */
        repeating-linear-gradient(
          -45deg,
          rgba(0, 0, 0, 0.1) 0px,
          rgba(0, 0, 0, 0.1) 1px,
          transparent 1px,
          transparent 5px
        ),
      /* Layer 3: The base blue color */ var(--color-textbg);

    /* Optional: If you want a border to define the button edge */
    border: 1px solid rgba(0,0,0,0.5);
    border-radius: 20px;
  }

  .introText button:hover {

    /* --- THE CROSSHATCH BACKGROUND --- */
    /* We stack 3 layers. The top two are the white lines, the bottom is the blue. */
    background:
    /* Layer 1: Diagonal stripes (45 degrees) - thin white lines with low opacity */
      repeating-linear-gradient(
        45deg,
        rgba(0, 100, 100, 0.2) 0px,
        /* Start white line */ rgba(0, 0, 0, 0.2) 1px,
        /* End white line (1px thick) */ transparent 1px,
        /* Start gap */ transparent 5px /* End gap (7px spacing) */
      ),
      /* Layer 2: Opposite diagonal stripes (-45 degrees) */
        repeating-linear-gradient(
          -45deg,
          rgba(0, 0, 0, 0.2) 0px,
          rgba(0, 0, 0, 0.2) 1px,
          transparent 1px,
          transparent 5px
        ),
      /* Layer 3: The base blue color */ var(--color-textbg);

    /* Optional: If you want a border to define the button edge */
     border: 1px solid rgba(0,0,0,0.5);
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
    /* background: #646a6e; */
  }
</style>
