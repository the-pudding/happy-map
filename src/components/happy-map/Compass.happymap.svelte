<script>
  import { onMount } from "svelte";

  let { deck, viewState, introStage } = $props();

  let compassContainer = $state();
  let viewportLeft = $state(20);
  let viewportTop = $state(20);
  let viewportWidth = $state(140);
  let viewportHeight = $state(140);
  let ready = $state(false);

  function updateViewport() {
    if (!compassContainer || !deck) return;

    try {
      const viewports = deck.getViewports();
      if (!viewports || viewports.length === 0) return;

      const viewport = viewports[0];
      const bounds = viewport.getBounds();

      const cw = compassContainer.offsetWidth;
      const padding = cw * (20 / 180);
      const compassInnerSize = cw - padding * 2;

      const leftPercent = Math.max(0, bounds[0] / 256);
      const rightPercent = Math.min(1, bounds[2] / 256);

      viewportLeft = padding + leftPercent * compassInnerSize;
      viewportWidth = Math.max(
        5,
        (rightPercent - leftPercent) * compassInnerSize
      );

      const topPercent = Math.max(0, bounds[1] / 256);
      const bottomPercent = Math.min(1, bounds[3] / 256);

      viewportTop = padding + topPercent * compassInnerSize;
      viewportHeight = Math.max(
        5,
        (bottomPercent - topPercent) * compassInnerSize
      );

      ready = true;
    } catch (e) {
      // Deck not ready yet
    }
  }

  onMount(() => {
    requestAnimationFrame(() => {
      updateViewport();
    });
  });

  $effect(() => {
    const _ = viewState?.zoom;
    const __ = viewState?.target;
    updateViewport();
  });

  $effect(() => {
    if (deck && compassContainer) {
      updateViewport();
    }
  });

  // Update compass when introStage changes (button clicks)
  $effect(() => {
    const _ = introStage;
    if (deck) {
      // Small delay to let the map animation start
      setTimeout(() => {
        updateViewport();
      }, 100);
    }
  });
</script>

<div class="compass" class:ready bind:this={compassContainer}>
  <!-- <div class="compassBackground"></div> -->
  <div
    class="viewport-box"
    style="left: {viewportLeft}px; top: {viewportTop}px; width: {viewportWidth}px; height: {viewportHeight}px;"
  ></div>
  <div class="yaxis"></div>
  <div class="compassLabel ylabel top">Immediate</div>
  <div class="compassLabel ylabel bottom">Long-term</div>
  <div class="xaxis"></div>
  <div class="compassLabel xlabel left">Less agency</div>
  <div class="compassLabel xlabel right">More agency</div>
</div>

<style>
  .compassBackground {
    position: absolute;
    left: -100%;
    bottom: -100%;

    /* 1. Set size to match the container so it's an actual rectangle shape */
    width: 210%;
    height: 210%;

    /* 2. Use a solid semi-transparent color.
     We don't need the gradient fading to 0% anymore,
     because the blur filter handles the edge fade. */
    /* background: rgba(71, 108, 149, 1); */
    background: var(--compassbg);
    /* 3. Create the rounded shape */
    border-radius: 40%;

    /* 4. Blur the entire element to make the edges fuzzy */
    filter: blur(30px);

    /* Optional: Because blurring shrinks the visual footprint slightly,
     you might want to scale it up a tiny bit to compensate. */
    transform: scale(1.1);

    /* Ensure it sits behind the text/lines */
    z-index: -1;
  }
  .compass {
    position: absolute;
    left: 10px;
    bottom: 10px;
    width: clamp(140px, 22vw, 180px);
    height: clamp(140px, 22vw, 180px);
    background: var(--compassbg);
    background-image: url("assets/minimap.png");
    background-size: 78% 78%;
    background-position: center center;
    background-repeat: no-repeat;
    z-index: 999;
    font-family: var(--handwriting);
    overflow: visible;
    opacity: 0;
    transition: opacity 0.3s ease;
    border: 2px solid #000;
  }

  @media (max-width: 1200px) {
    .compass {
      left: auto;
      bottom: auto;
      right: 5px;
      top: 5px;
      /* background: radial-gradient(
        circle at top right,
        rgba(71, 108, 149, 1) 0%,
        rgba(71, 108, 149, 1) 35%,
        rgba(71, 108, 149, 0) 65%
      ); */
    }
    .compassBackground {
      position: absolute;
      right: -100%;
      top: -100%;
      left: auto;
      bottom: auto;
    }
  }

  .compass.ready {
    opacity: 1;
  }

  .viewport-box {
    position: absolute;
    pointer-events: none;
    z-index: 50;
    max-width: 78%;
    max-height: 78%;
    background-color: transparent;
    background-image:
      repeating-linear-gradient(
        45deg,
        var(--compasscrosshatch) 0px,
        var(--compasscrosshatch) 2px,
        transparent 2px,
        transparent 8px
      ),
      repeating-linear-gradient(
        -60deg,
        var(--compasscrosshatch) 0px,
        var(--compasscrosshatch) 1px,
        transparent 1px,
        transparent 6px
      );
    border: 1px solid var(--compasscrosshatch);
  }

  .yaxis {
    position: absolute;
    left: 50%;
    top: 11%;
    height: 78%;
    border-left: 1px solid var(--compasstext);
    z-index: 60;
  }

  .xaxis {
    position: absolute;
    top: 50%;
    left: 11%;
    width: 78%;
    border-top: 1px solid var(--compasstext);
    z-index: 60;
  }

  .compassLabel {
    position: absolute;
    font-size: clamp(12px, 1.2vw, 12px);
    line-height: 1;
    font-weight: 400;
    color: var(--compasstext);
    z-index: 70;
    text-shadow: 1px 1px 12px #fff;
  }

  .compassLabel.ylabel {
    width: 100%;
    text-align: center;
  }

  .compassLabel.xlabel {
    bottom: calc(50% + 3px);
    text-align: center;
    max-width: 45%;
  }

  .compassLabel.top {
    top: 3%;
  }

  .compassLabel.bottom {
    bottom: 3%;
  }

  .compassLabel.left {
    left: 3%;
    text-align: left;
  }

  .compassLabel.right {
    right: 3%;
    text-align: right;
  }
</style>
