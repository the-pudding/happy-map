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
    left: 20px;
    bottom: 20px;
    width: 320px;
    padding: 30px;

    /* Font settings */
    font-family: "Patrick Hand SC", cursive;
    color: black;

    /* 1. Remove the default background (the ::before element will handle it) */
    background: #cfe3d4;
  }

  /* The "Hand Drawn" Paper Background */
  .introText::before {
    content: "";
    position: absolute;

    /* 2. Positioning: Stretch slightly outside the text content */
    inset: 0;

    /* 3. The White Paper & Ink Border */
    background: #cfe3d4;
    border: 1px solid #000; /* Black ink border */

    /* 4. Organic Shape (Messy corners) */
    /* border-radius: 2% 1% 2% 3% / 3% 2% 1% 2%; */

    /* 5. The Wiggle Filter (Must match the ID in your HTML SVG) */
    filter: url(#parchment-squiggle);

    /* 6. Layering: Put it BEHIND the text */
    z-index: -1;

    /* 7. Optional: Paper Shadow for depth */
    box-shadow: 3px 4px 0px rgba(0, 0, 0, 0.15);

    /* 8. Anti-aliasing trick: slightly larger border helps smooth the wiggle */
    /* If it looks pixelated, increase border width to 3px */
  }

  .introText :global(h1) {
    font-size: 30px;
    /* color: #ffec70; */
    /* line-height: 15px; */
    margin: 0 0 10px 0;
    text-align: center;
  }

  .introText :global(.byline) {
    font-size: 20px;
    line-height: 15px;
    margin: 0 0 30px 0;
    text-align: center;
    text-decoration: none;
  }

  .introText :global(p) {
    font-size: 16px;
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

  .introText :global(.byline a) {
    color: #e100ff !important;
    border-bottom: 1px dotted #e100ff;
  }

  .introText :global(.byline a:hover) {
    color: #f263ff !important;
    border-bottom: 1px dotted #b200c2;
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
    font-family: "Patrick Hand SC", cursive;
    font-size: 20px;
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
      /* Layer 3: The base blue color */ #cfe3d4;

    /* Optional: If you want a border to define the button edge */
    border: 1px solid rgba(0,0,0,0.5);
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
      /* Layer 3: The base blue color */ #cfe3d4;

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
