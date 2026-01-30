<script>
  import { onMount, onDestroy } from "svelte";
  import { Deck, OrthographicView } from "@deck.gl/core";
  import { TileLayer } from "@deck.gl/geo-layers";
  import { BitmapLayer, IconLayer } from "@deck.gl/layers";
  import {
    matchesFilters,
    getIconName,
    shuffle,
    getInitialZoom
  } from "$components/helpers/textUtils.js";
  import {
    createLabelLayers,
    spreadDotsToGrid
  } from "$components/helpers/labelUtils.js";
  import {
    OrthographicFlyToInterpolator,
    createOpacityAnimator,
    createWiggleAnimator
  } from "$components/helpers/animationUtils.js";
  import Popup from "$components/happy-map/Popup.happymap.svelte";
  import Compass from "$components/happy-map/Compass.happymap.svelte";
  import copy from "$data/copy.json";

  let {
    filters,
    introShown,
    storyActiveIndex = $bindable(),
    popupInfo = $bindable(),
    onReady
  } = $props();
  let fontLoaded = $state(false);

  // --- CONSTANTS ---
  const MAX_ICONS = 2000;
  const ICON_SIZE = { width: 120, height: 225 };
  const POPUP_OFFSET = 1.8;
  const ZOOM_STEP = 0.5;

  const storyTargetIds = new Set(
    copy.story.filter((s) => s.targetId).map((s) => parseInt(s.targetId, 10))
  );

  // --- STATE ---
  let canvasElement;
  let deck = null;
  let tileLayer = null;
  let shallowWaterLayer = null;
  let waveData = [];
  let backgroundOpacity = $state(1);
  let allLabels = $state([]);
  let allDots = [];
  let viewState = $state({
    target: [128, 128, 0],
    zoom: 2,
    minZoom: 0,
    maxZoom: 6
  });
  let wiggleOffset = $state(0);

  // --- HELPERS ---
  const getIconSize = (zoom) => 5 + Math.pow(zoom, 1.7) * 2;
  const getWaveScale = (zoom) => 0.6 + zoom * 0.25;

  const opacityAnimator = createOpacityAnimator((opacity) => {
    backgroundOpacity = opacity;
    if (deck) renderDeck();
  });

  const wiggleAnimator = createWiggleAnimator((offset) => {
    wiggleOffset = offset;
    if (deck) renderDeck();
  });

  function createWaveData() {
    const waves = [];
    const center = 128;
    const minDistFromCenter = 80;
    const minWaveDistance = 20;

    // Fixed seed points spread across the area
    const seedPoints = [];
    for (let i = 0; i < 500; i++) {
      // Deterministic pseudo-random based on index
      const seed1 = ((i * 127 + 43) % 1000) / 1000;
      const seed2 = ((i * 311 + 97) % 1000) / 1000;

      // Use seeds to place points in a circular pattern with randomness
      const angle = seed1 * Math.PI * 2;
      const radius = minDistFromCenter + seed2 * 200;

      const x = center + Math.cos(angle) * radius + ((i * 173) % 100 - 50) * 0.5;
      const y = center + Math.sin(angle) * radius + ((i * 241) % 100 - 50) * 0.5;

      seedPoints.push({ x, y, i });
    }

    // Filter points that are too close to each other
    for (const point of seedPoints) {
      const { x, y, i } = point;

      // Check distance from center
      const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
      if (dist < minDistFromCenter) continue;

      // Check distance to existing waves
      let tooClose = false;
      for (const wave of waves) {
        const dx = x - wave.x;
        const dy = y - wave.y;
        if (Math.sqrt(dx * dx + dy * dy) < minWaveDistance) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Fewer waves at edges
      const edgeDist = dist - minDistFromCenter;
      const seed3 = ((i * 89 + 199) % 1000) / 1000;
      const skipChance = Math.pow(edgeDist / 200, 2);
      if (seed3 < skipChance) continue;

      // Deterministic properties
      const seed4 = ((i * 53 + 97) % 1000) / 1000;
      const seed5 = ((i * 151 + 263) % 1000) / 1000;

      waves.push({
        x,
        y,
        waveType: 1 + Math.floor(seed4 * 7),
        rotation: 0,
        opacity: Math.max(0.15, 0.5 - (edgeDist / 300))
      });

      if (waves.length >= 100) break;
    }

    return waves;
  }

  function handleZoomIn() {
    const newZoom = Math.min(viewState.zoom + ZOOM_STEP, viewState.maxZoom);
    viewState = {
      ...viewState,
      zoom: newZoom,
      transitionDuration: 300,
      transitionInterpolator: new OrthographicFlyToInterpolator()
    };
    deck?.setProps({ initialViewState: viewState });
  }

  function handleZoomOut() {
    const newZoom = Math.max(viewState.zoom - ZOOM_STEP, viewState.minZoom);
    viewState = {
      ...viewState,
      zoom: newZoom,
      transitionDuration: 300,
      transitionInterpolator: new OrthographicFlyToInterpolator()
    };
    deck?.setProps({ initialViewState: viewState });
  }

  // --- DATA LOADING ---
  async function loadData() {
    try {
      const [labelsRes, dotsRes] = await Promise.all([
        fetch("assets/labels_cleaned.json"),
        fetch("assets/interaction.json")
      ]);

      const labelsRaw = await labelsRes.json();
      const TYPE_RANK = { l1: 1000, l2: 500, l3: 1 };
      labelsRaw.forEach((l, i) => {
        l._random = Math.random();
        l._uniqueId = `lbl_${i}`;
      });
      allLabels = labelsRaw.sort(
        (a, b) =>
          (TYPE_RANK[b.type] || 0) - (TYPE_RANK[a.type] || 0) ||
          b.priority - a.priority ||
          b._random - a._random
      );

      const rawDots = await dotsRes.json();
      rawDots.forEach((d, i) => (d._stableId = i));
      allDots = shuffle(rawDots).sort(
        (a, b) => (b.rank_score ?? -Infinity) - (a.rank_score ?? -Infinity)
      );
    } catch (err) {
      console.error("Error loading data:", err);
    }
  }

  // --- RENDER ---
  function renderDeck() {
    if (!deck) return;

    try {
      if (!deck.getViewports()?.length) {
        requestAnimationFrame(renderDeck);
        return;
      }
    } catch {
      requestAnimationFrame(renderDeck);
      return;
    }

    // Filter dots
    const dotsToFilter = [];
    const includedIds = new Set();

    const storyDot =
      storyActiveIndex !== -1 &&
      allDots.find((d) => d._stableId === storyActiveIndex);
    if (storyDot) {
      storyDot._isActive = true;
      dotsToFilter.push(storyDot);
      includedIds.add(storyDot._stableId);
    }

    for (const targetId of storyTargetIds) {
      if (includedIds.has(targetId)) continue;
      const dot = allDots.find((d) => d._stableId === targetId);
      if (dot) {
        dot._isActive = false;
        dotsToFilter.push(dot);
        includedIds.add(targetId);
      }
    }

    for (const p of allDots) {
      if (dotsToFilter.length >= MAX_ICONS) break;
      if (includedIds.has(p._stableId)) continue;
      if (!matchesFilters(p, filters)) continue;
      p._isActive = false;
      dotsToFilter.push(p);
    }

    const dotsToRender = spreadDotsToGrid(dotsToFilter);
    const sortedDots = [...dotsToRender].sort((a, b) => a[1] - b[1]);

    const selectedId = popupInfo?.data?._stableId;

    const iconLayer = new IconLayer({
      id: "dots",
      data: sortedDots,
      getPosition: (d) => {
        const baseX = d[0] * 256;
        const baseY = d[1] * 256;
        if (selectedId !== undefined && d._stableId === selectedId) {
          return [baseX + wiggleOffset, baseY];
        }
        return [baseX, baseY];
      },
      getIcon: (d) => ({
        url: `assets/icons/${getIconName(d)}.png`,
        ...ICON_SIZE,
        mask: false,
        anchorY: ICON_SIZE.height
      }),
      getSize: () => getIconSize(viewState.zoom),
      getColor: () => [255, 255, 255, 255],
      sizeScale: window.devicePixelRatio || 1,
      sizeUnits: "pixels",
      pickable: true,
      alphaCutoff: 0,
      billboard: true,
      parameters: { depthTest: false },
      textureParameters: { minFilter: "linear", magFilter: "linear" },
      updateTriggers: {
        getColor: [backgroundOpacity, storyActiveIndex],
        getPosition: [wiggleOffset, selectedId]
      },
      onClick: ({ object }) => {
        if (!object) return;
        const viewport = deck.getViewports()[0];
        if (!viewport) return;
        const [x, y] = viewport.project([object[0] * 256, object[1] * 256]);
        popupInfo = {
          x,
          y: y - getIconSize(viewState.zoom) * POPUP_OFFSET,
          data: object
        };
        wiggleAnimator.start();
      }
    });

    const waveLayer = new IconLayer({
      id: "waves",
      data: waveData,
      getPosition: (d) => [d.x, d.y],
      getIcon: (d) => ({
        url: `assets/wave${d.waveType}.svg`,
        width: 200 * 3,
        height: 50 * 3
        // mask: true
      }),
      getSize: () => getWaveScale(viewState.zoom) * 20,
      getAngle: (d) => 180 + d.rotation * (180 / Math.PI),
      getColor: (d) => [0, 0, 0, Math.floor(d.opacity * 400)], // Black with opacity
      sizeScale: window.devicePixelRatio || 1,
      sizeUnits: "pixels",
      billboard: false,
      updateTriggers: {
        getSize: [viewState.zoom]
      }
    });

    const layers = [
      waveLayer,
      shallowWaterLayer,
      tileLayer,
      iconLayer,
      ...createLabelLayers(allLabels, viewState.zoom, fontLoaded)
    ].filter(Boolean);

    deck.setProps({ layers });
  }

  // --- EXPORTED METHODS ---
  export function animateOpacity(targetOpacity, duration = 500) {
    opacityAnimator.animate(backgroundOpacity, targetOpacity, duration);
  }

  export function flyTo(targetX, targetY, zoom) {
    viewState = {
      ...viewState,
      target: [targetX, targetY, 0],
      zoom,
      transitionDuration: 2500,
      transitionInterpolator: new OrthographicFlyToInterpolator()
    };
    deck?.setProps({ initialViewState: viewState });
  }

  export function showPopupForDot(stableId) {
    const dot = allDots.find((d) => d._stableId === stableId);
    const viewport = deck?.getViewports()[0];
    if (!dot || !viewport) return;
    const [x, y] = viewport.project([dot[0] * 256, dot[1] * 256]);
    popupInfo = {
      x,
      y: y - getIconSize(viewState.zoom) * POPUP_OFFSET,
      data: dot
    };
    wiggleAnimator.start();
  }

  // --- LIFECYCLE ---
  onMount(async () => {
    await loadData();

    document.fonts.load('400 16px "Patrick Hand SC"').then(() => {
    console.log("Font loaded!");
    fontLoaded = true; // <--- Flip the switch
    if (deck) renderDeck();
  });

    if (!canvasElement.offsetWidth || !canvasElement.offsetHeight) {
      canvasElement.style.width = "100%";
      canvasElement.style.height = "100%";
    }

    viewState = { ...viewState, zoom: getInitialZoom() };

    // Create wave data
    waveData = createWaveData();

    // Shallow water layer
    shallowWaterLayer = new BitmapLayer({
      id: "shallow-water",
      image: "assets/ocean-glow-varied.png",
      bounds: [-50, 306, 306, -50],
      opacity: 0.4,
      parameters: {
        blendFunc: [770, 1],
        blendEquation: 32774
      }
    });

    tileLayer = new TileLayer({
      id: "tiles",
      minZoom: 0,
      maxZoom: 6,
      tileSize: 256,
      extent: [0, 0, 256, 256],
      refinementStrategy: "best-available",
      getTileData: async ({ index: { x, y, z } }) => {
        try {
          const response = await fetch(`assets/tiles/${z}/${x}/${y}.png`);
          if (!response.ok) return null;
          const blob = await response.blob();
          const img = new Image();
          img.crossOrigin = "anonymous";
          return new Promise((resolve) => {
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(blob);
          });
        } catch {
          return null;
        }
      },
      renderSubLayers: ({ id, data, tile }) => {
        if (!data) return null;
        const { left, top, right, bottom } = tile.bbox;
        return new BitmapLayer({
          id,
          image: data,
          bounds: [left, bottom, right, top]
        });
      }
    });

    deck = new Deck({
      canvas: canvasElement,
      width: "100%",
      height: "100%",
      initialViewState: viewState,
      controller: { doubleClickZoom: false, keyboard: false },
      views: new OrthographicView({ id: "ortho" }),
      pickingRadius: 15,
      getCursor: ({ isDragging, isHovering }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab",
      onViewStateChange: ({ viewState: newViewState, interactionState }) => {
        viewState = newViewState;
        if (interactionState?.isDragging) {
          popupInfo = null;
          wiggleAnimator.stop();
        }
        if (deck) renderDeck();
      },
      onAfterRender: () => {
        if (!popupInfo?.data) return;
        const viewport = deck.getViewports()[0];
        if (!viewport) return;
        const [newX, newY] = viewport.project([
          popupInfo.data[0] * 256,
          popupInfo.data[1] * 256
        ]);
        const y = newY - getIconSize(viewState.zoom) * POPUP_OFFSET;
        if (
          Math.abs(popupInfo.x - newX) > 0.5 ||
          Math.abs(popupInfo.y - y) > 0.5
        ) {
          popupInfo = { ...popupInfo, x: newX, y };
        }
      },
      onClick: ({ object }) => {
        if (!object) {
          popupInfo = null;
          wiggleAnimator.stop();
        }
      },
      onLoad: () => {
        renderDeck();
        onReady?.();
      }
    });
  });

  onDestroy(() => {
    deck?.finalize();
    opacityAnimator.cancel();
    wiggleAnimator.stop();
  });

  $effect(() => {
    JSON.stringify(filters);
    storyActiveIndex;
    if (deck) renderDeck();
  });
</script>

<div class="map-container">
  <canvas bind:this={canvasElement} class="deck-canvas"></canvas>
  <Popup bind:popupInfo />
  {#if !introShown}
    <Compass {deck} {viewState} />
  {/if}

  <div class="zoom-controls">
    <button
      class="zoom-btn"
      onclick={handleZoomIn}
      disabled={viewState.zoom >= viewState.maxZoom}
      aria-label="Zoom in"
    >
      +
    </button>
    <button
      class="zoom-btn"
      onclick={handleZoomOut}
      disabled={viewState.zoom <= viewState.minZoom}
      aria-label="Zoom out"
    >
      −
    </button>
  </div>
</div>

<style>
  .map-container {
    position: absolute;
    inset: 0;
  }

  .deck-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .zoom-controls {
    position: absolute;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .zoom-btn {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 4px;
    background: white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    font-size: 20px;
    font-weight: 500;
    color: #333;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s ease;
  }

  .zoom-btn:hover:not(:disabled) {
    background: #f0f0f0;
  }

  .zoom-btn:active:not(:disabled) {
    background: #e0e0e0;
  }

  .zoom-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
