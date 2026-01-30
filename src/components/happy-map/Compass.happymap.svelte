<script>
  let { deck, viewState } = $props();

  let compassContainer = $state();
  let viewportLeft = $state(20);
  let viewportTop = $state(20);
  let viewportWidth = $state(140);
  let viewportHeight = $state(140);

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
    } catch (e) {
      // Deck not ready yet
    }
  }

  // Update when viewState zoom or target changes
  $effect(() => {
    // Access specific properties to trigger reactivity
    const _ = viewState?.zoom;
    const __ = viewState?.target;
    updateViewport();
  });
</script>

<div class="compass" bind:this={compassContainer}>
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

<svg style="visibility: hidden; position: absolute;" width="0" height="0">
  <defs>
    <filter id="parchment-squiggle">
      <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise" />

      <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" result="distorted" />

      <!-- <feGaussianBlur in="distorted" stdDeviation="0.7" /> -->
    </filter>
  </defs>
</svg>

<style>
  .compass {
  position: absolute;
  left: 10px;
  bottom: max(10px, env(safe-area-inset-bottom, 10px));
  width: clamp(130px, 18vw, 180px);
  height: clamp(130px, 18vw, 180px);
  z-index: 999;
  font-family: "Patrick Hand SC", "cursive";

  /* Background logic */
  background: #36577d;
  /* box-shadow: 2px 3px 5px rgba(0,0,0,0.3); */

  /* SHAPE 1: The Container */
  border-radius: 2% 5% 3% 4% / 5% 3% 5% 2%;
}

/* The "Fountain Pen" Border */
.compass::before {
  content: "";
  position: absolute;

  /* FIX: Change -3px to 0. This makes the border sit EXACTLY on the edge. */
  inset: 0;

  /* Border settings */
  border: 1px solid #fff; /* Increased to 3px so it covers the edge better */

  /* SHAPE 2: Must match SHAPE 1 exactly */
  border-radius: 2% 5% 3% 4% / 5% 3% 5% 2%;

  /* Filter settings */
  filter: url(#parchment-squiggle);
  pointer-events: none;
  z-index: 1; /* Changed to 1 so the border sits ON TOP of the blue background */
}
.viewport-box {
    position: absolute;
    pointer-events: none;
    z-index: 50;

    /* 1. Transparent Background */
    background-color: transparent;

    /* 2. The White Cross-Hatch Stack */
    background-image:
        /* Layer 1: Thick diagonal strokes (45deg) - White/Chalk */
        repeating-linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.3) 0px,
            rgba(255, 255, 255, 0.3) 2px,
            transparent 2px,
            transparent 8px
        ),
        /* Layer 2: Thinner, steeper strokes (-60deg) - White/Chalk */
        repeating-linear-gradient(
            -60deg,
            rgba(255, 255, 255, 0.2) 0px,
            rgba(255, 255, 255, 0.2) 1px,
            transparent 1px,
            transparent 6px
        );

    /* 3. Rough Edges */
    border-radius: 2px 255px 3px 25px / 255px 5px 22px 3px;

    /* 4. Border Color (White sketch) */
    border: 1px solid rgba(255, 255, 255, 0.5);
}

  .yaxis {
    position: absolute;
    left: 50%;
    top: 11%;
    height: 78%;
    border-left: 1px solid rgb(232, 249, 255);
    z-index: 60;
  }

  .xaxis {
    position: absolute;
    top: 50%;
    left: 11%;
    width: 78%;
    border-top: 1px solid rgb(232, 249, 255);
    z-index: 60;
  }

  .compassLabel {
    position: absolute;
    font-size: clamp(12px, 1.2vw, 16px);
    line-height: 1;
    font-weight: 300;
    color: rgb(232, 249, 255);
    z-index: 70;
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
