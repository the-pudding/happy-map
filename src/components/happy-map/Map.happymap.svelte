<script>
  import { onMount, onDestroy } from "svelte";
  import { Deck, OrthographicView } from "@deck.gl/core";
  import { TileLayer } from "@deck.gl/geo-layers";
  import { BitmapLayer, IconLayer } from "@deck.gl/layers";
  import { DataFilterExtension } from "@deck.gl/extensions";
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

  // Icon Atlas
  import iconMapping from "$data/icon-mapping.json";
  const ICON_ATLAS = "assets/icon-atlas.png";

  let {
    filters,
    introShown,
    storyActiveIndex = $bindable(),
    popupInfo = $bindable(),
    onReady
  } = $props();
  let fontLoaded = $state(false);
  let lastPopupUpdate = 0;

  // --- CONSTANTS ---
  const MAX_ICONS = 4000;
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

  // Pre-processed dots for GPU filtering
  let processedDots = null;

  // --- HELPERS ---
  const getIconSize = (zoom) => 6 + Math.pow(zoom, 2);
  const getWaveScale = (zoom) => 0.6 + zoom * 0.25;

  const opacityAnimator = createOpacityAnimator((opacity) => {
    backgroundOpacity = opacity;
    if (deck) renderDeck();
  });

  const wiggleAnimator = createWiggleAnimator((offset) => {
    wiggleOffset = offset;
    if (deck) renderDeck();
  });

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

  // Process dots once, filter on GPU
  function getProcessedDots() {
    if (processedDots) return processedDots;

    // Collect story target IDs that must be included
    const mustInclude = new Set(storyTargetIds);

    // Start with story dots
    const dotsToProcess = [];
    const includedIds = new Set();

    // First, add all story target dots
    for (const dot of allDots) {
      if (mustInclude.has(dot._stableId)) {
        dotsToProcess.push(dot);
        includedIds.add(dot._stableId);
      }
    }

    // Then fill up to MAX_ICONS with remaining dots
    for (const dot of allDots) {
      if (dotsToProcess.length >= MAX_ICONS) break;
      if (includedIds.has(dot._stableId)) continue;
      dotsToProcess.push(dot);
    }

    const dotsToRender = spreadDotsToGrid(dotsToProcess);

    // Sort by Y once for proper rendering order
    processedDots = [...dotsToRender].sort((a, b) => a[1] - b[1]);

    return processedDots;
  }

  // --- DATA LOADING ---
  async function loadData() {
    try {
      const [labelsRes, dotsRes, wavesRes] = await Promise.all([
        fetch("assets/labels_cleaned.json"),
        fetch("assets/interaction.json"),
        fetch("assets/waves.json")
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

      waveData = await wavesRes.json();
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

    const sortedDots = getProcessedDots();
    const selectedId = popupInfo?.data?._stableId;

    const dataFilterExtension = new DataFilterExtension({ filterSize: 1 });

    const iconLayer = new IconLayer({
      id: "dots",
      data: sortedDots,

      iconAtlas: ICON_ATLAS,
      iconMapping: iconMapping,

      getPosition: (d) => {
        const baseX = d[0] * 256;
        const baseY = d[1] * 256;
        if (selectedId !== undefined && d._stableId === selectedId) {
          return [baseX + wiggleOffset, baseY];
        }
        return [baseX, baseY];
      },

      getIcon: (d) => getIconName(d),
      getSize: () => getIconSize(viewState.zoom) * 1.5,

      sizeScale: 1,
      sizeUnits: "pixels",
      pickable: true,
      alphaCutoff: 0,
      billboard: true,
      parameters: { depthTest: false },

      // GPU FILTERING
      getFilterValue: (d) => {
        if (d._stableId === storyActiveIndex) return 1;
        if (storyTargetIds.has(d._stableId)) return 1;
        return matchesFilters(d, filters) ? 1 : 0;
      },
      filterRange: [1, 1],
      extensions: [dataFilterExtension],

      updateTriggers: {
        getPosition: [wiggleOffset, selectedId],
        getSize: [viewState.zoom],
        getFilterValue: [JSON.stringify(filters), storyActiveIndex]
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
      }),
      getSize: () => getWaveScale(viewState.zoom) * 20,
      getAngle: (d) => 180 + d.rotation * (180 / Math.PI),
      getColor: (d) => [0, 0, 0, Math.floor(d.opacity * 400)],
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
    const newViewState = {
      target: [targetX, targetY, 0],
      zoom,
      minZoom: 0,
      maxZoom: 6,
      transitionDuration: 2500,
      transitionInterpolator: new OrthographicFlyToInterpolator()
    };

    viewState = newViewState;
    deck?.setProps({ initialViewState: newViewState });
  }

  export function flyToDot(stableId, zoom) {
    const dots = getProcessedDots();
    if (!dots || dots.length === 0) return;

    const dot = dots.find((d) => d._stableId === stableId);
    if (!dot) return;

    const targetX = dot[0] * 256;
    const targetY = dot[1] * 256;

    flyTo(targetX, targetY, zoom);
  }

  export function showPopupForDot(stableId) {
    const dots = getProcessedDots();
    const dot = dots.find((d) => d._stableId === stableId);

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
      fontLoaded = true;
      if (deck) renderDeck();
    });

    if (!canvasElement.offsetWidth || !canvasElement.offsetHeight) {
      canvasElement.style.width = "100%";
      canvasElement.style.height = "100%";
    }

    viewState = { ...viewState, zoom: getInitialZoom() };

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
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null); // Silently fail
          img.src = `assets/tiles/${z}/${x}/${y}.png`;
        });
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

        const now = performance.now();
        if (now - lastPopupUpdate < 33) return;
        lastPopupUpdate = now;

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
        if (object) {
          const viewport = deck.getViewports()[0];
          if (!viewport) return;
          const [x, y] = viewport.project([object[0] * 256, object[1] * 256]);
          popupInfo = {
            x,
            y: y - getIconSize(viewState.zoom) * POPUP_OFFSET,
            data: object
          };
          wiggleAnimator.start();
        } else {
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
