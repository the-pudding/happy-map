<script>
  import { onMount } from "svelte";

  let { deck, viewState, introStage, allDots = [] } = $props();

  let compassContainer = $state();
  let canvasElement = $state();

  let viewportLeft = $state(20);
  let viewportTop = $state(20);
  let viewportWidth = $state(140);
  let viewportHeight = $state(140);
  let ready = $state(false);

  // --- 1. Draw Density Map ---
  function drawDensity() {
    if (!canvasElement || !compassContainer || !allDots) return;

    const ctx = canvasElement.getContext('2d');
    const cw = compassContainer.offsetWidth;
    const ch = compassContainer.offsetHeight;

    if (cw === 0 || ch === 0) return;

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    if (canvasElement.width !== cw * dpr || canvasElement.height !== ch * dpr) {
      canvasElement.width = cw * dpr;
      canvasElement.height = ch * dpr;
      ctx.scale(dpr, dpr);
    }

    // Clear previous frame
    ctx.clearRect(0, 0, cw, ch);

    // If fewer than 50 dots, show nothing (cleaner look)
    if (allDots.length < 50) return;

    // Calculate drawing area based on 11% padding
    const padding = cw * 0.11;
    const innerSize = cw * 0.78;

    // --- TUNED DENSITY SETTINGS ---

    // 1. Lower Opacity Cap: prevents saturation.
    //    Range: 0.03 (for 4000 dots) to 0.4 (for 50 dots)
    const dynamicOpacity = Math.max(0.05, Math.min(0.15, 300 / allDots.length));

    // 2. Dark Ink Color: Deep blue-black works best with multiply
    ctx.fillStyle = `rgba(250, 30, 140, ${dynamicOpacity})`;

    // 3. Blend Mode: Multiply creates a true "ink buildup" effect
    ctx.globalCompositeOperation = 'multiply';

    // 4. Larger Radius: Increases the chance of overlap, making clusters pop
    const radius = 2;

    allDots.forEach(dot => {
      let rawX, rawY;

      if (Array.isArray(dot)) {
        rawX = dot[0];
        rawY = dot[1];
      } else {
        rawX = parseFloat(dot.lng || dot.x);
        rawY = parseFloat(dot.lat || dot.y);
      }

      if (isNaN(rawX) || isNaN(rawY)) return;

      // Normalization check
      if (rawX > 1) rawX /= 256;
      if (rawY > 1) rawY /= 256;

      const x = padding + (rawX * innerSize);
      const y = padding + (rawY * innerSize);

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Reset blend mode
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- 2. Update Viewport Box ---
  function updateViewport() {
    if (!compassContainer || !deck) return;

    try {
      const viewports = deck.getViewports();
      if (!viewports || viewports.length === 0) return;

      const viewport = viewports[0];
      const bounds = viewport.getBounds();

      const cw = compassContainer.offsetWidth;
      const padding = cw * 0.11;
      const compassInnerSize = cw * 0.78;

      const leftPercent = Math.max(0, bounds[0] / 256);
      const rightPercent = Math.min(1, bounds[2] / 256);
      const topPercent = Math.max(0, bounds[1] / 256);
      const bottomPercent = Math.min(1, bounds[3] / 256);

      viewportLeft = padding + leftPercent * compassInnerSize;
      viewportWidth = Math.max(4, (rightPercent - leftPercent) * compassInnerSize);

      viewportTop = padding + topPercent * compassInnerSize;
      viewportHeight = Math.max(4, (bottomPercent - topPercent) * compassInnerSize);

      ready = true;
    } catch (e) {
      // Deck not ready yet
    }
  }

  onMount(() => {
    const interval = setInterval(() => {
        if (compassContainer) {
            updateViewport();
            drawDensity();
        }
    }, 500);

    const ro = new ResizeObserver(() => {
      updateViewport();
      drawDensity();
    });
    if (compassContainer) ro.observe(compassContainer);

    return () => {
        clearInterval(interval);
        ro.disconnect();
    }
  });

  // Reactive: Redraw whenever data changes
  $effect(() => {
    const _dots = allDots;
    if (compassContainer && canvasElement) {
       drawDensity();
    }
  });

  // Reactive: Update box on move
  $effect(() => {
    const _ = viewState?.zoom;
    const __ = viewState?.target;
    updateViewport();
  });
</script>

<div class="compass" class:ready bind:this={compassContainer}>
  <canvas bind:this={canvasElement} class="density-canvas"></canvas>

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
    position: fixed;
    left: 10px;
    bottom: 10px;
    width: clamp(140px, 22vw, 180px);
    height: clamp(140px, 22vw, 180px);
    z-index: 999;
    font-family: var(--handwriting);
    overflow: hidden;
    opacity: 0;
    transition: opacity 0.3s ease;
    border: 2px solid #000;

    background-color: var(--compassbg);
    background-image: url("assets/minimap.png");
    background-size: 78% 78%;
    background-position: center center;
    background-repeat: no-repeat;
  }


  .density-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
  }

  .viewport-box {
    position: absolute;
    pointer-events: none;
    z-index: 50;
    background-color: transparent;
    border: 1px solid #000;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.5);

    background-image:
      repeating-linear-gradient(45deg, var(--compasscrosshatch) 0px, var(--compasscrosshatch) 2px, transparent 2px, transparent 8px),
      repeating-linear-gradient(-60deg, var(--compasscrosshatch) 0px, var(--compasscrosshatch) 1px, transparent 1px, transparent 6px);
  }

 /* Tablet / Small Laptop: Move to top-right */
  @media (max-width: 1200px) {
    .compass {
      left: auto;
      bottom: auto;
      right: 15px;
      top: 15px;
    }
  }

  /* Mobile: Push down to clear the iOS Notch/Status Bar */
  @media (max-width: 600px) {
    .compass {
      /* Use env() to detect the notch size, with a 60px fallback */
      top: 10px;
      right: 10px;
    }
  }

  .compass.ready {
    opacity: 1;
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

  .compassLabel.ylabel { width: 100%; text-align: center; }
  .compassLabel.xlabel { bottom: calc(50% + 3px); text-align: center; max-width: 45%; }
  .compassLabel.top { top: 3%; }
  .compassLabel.bottom { bottom: 3%; }
  .compassLabel.left { left: 3%; text-align: left; }
  .compassLabel.right { right: 3%; text-align: right; }
</style>
