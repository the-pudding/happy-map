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

<style>
  .compass {
    position: absolute;
    left: 10px;
    bottom: max(10px, env(safe-area-inset-bottom, 10px));
    width: clamp(130px, 18vw, 180px);
    height: clamp(130px, 18vw, 180px);
    background: #002436;
    z-index: 999;
    border: 2px solid #264a5c;
    border-radius: 4px;
    overflow: hidden;
    font-family: var(--sans);
  }

  .viewport-box {
    position: absolute;
    background: rgba(158, 255, 220, 0.4);
    pointer-events: none;
    z-index: 50;
    border-radius: 1px;
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
    font-size: clamp(10px, 1.2vw, 12px);
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
