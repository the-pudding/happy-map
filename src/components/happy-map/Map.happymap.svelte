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
  import { createLabelLayers, spreadDotsToGrid } from "$components/helpers/labelUtils.js";
  import {
    OrthographicFlyToInterpolator,
    createOpacityAnimator,
    createWiggleAnimator
  } from "$components/helpers/animationUtils.js";
  import Popup from "$components/happy-map/Popup.happymap.svelte";
  import NarratorPopup from "$components/happy-map/NarratorPopup.happymap.svelte";
  import Compass from "$components/happy-map/Compass.happymap.svelte";
  import copy from "$data/copy.json";

  // Icon Atlas
  import iconMapping from "$data/icon-mapping.json";
  const ICON_ATLAS = "assets/icon-atlas.png";

  let {
    filters,
    introShown,
    introStage = $bindable(),
    storyActiveIndex = $bindable(),
    popupInfo = $bindable(),
    onReady
  } = $props();
  let fontLoaded = $state(false);
  let lastPopupUpdate = 0;

  // --- CONSTANTS ---
  const MAX_ICONS = 4000;
  const ICON_POPUP_OFFSET = 1.2;  // Offset for regular icon popups
  const NARRATOR_POPUP_OFFSET = 1.7;  // Offset for narrator popups
  const ZOOM_STEP = 0.5;

  const storyTargetIds = new Set(
    copy.story.filter((s) => s.targetId).map((s) => parseInt(s.targetId, 10))
  );

  // --- STATE ---
  let canvasElement;
  let deck = null;
  let validTiles = new Set();
  let tileLayer = null;
  let shallowWaterLayer = null;
  let waveData = [];
  let backgroundOpacity = $state(1);
  let allLabels = $state([]);
  let allDots = [];
  // Calculate initial position from story[0] if available
  const getInitialViewState = () => {
    const story = copy.story?.[0];
    if (story?.lng && story?.lat && story?.zoom) {
      return {
        target: [parseFloat(story.lng) * 256, parseFloat(story.lat) * 256, 0],
        zoom: parseFloat(story.zoom),
        minZoom: 0,
        maxZoom: 6
      };
    }
    return {
      target: [128, 128, 0],
      zoom: 2,
      minZoom: 0,
      maxZoom: 6
    };
  };

  let viewState = $state(getInitialViewState());
  let wiggleOffset = $state(0);

  // Narrator state
  let narratorIcons = $state([]); // Array of {id, lng, lat, opacity, text}
  let activeNarratorId = $state(null);
  let narratorPopupInfo = $state(null);

  // Pre-processed dots for GPU filtering
  let processedDots = null;
  let processedDotsFilterKey = '';

  // --- HELPERS ---
  const getIconSize = (zoom) => 3 + Math.pow(zoom, 2.1);
  const getWaveScale = (zoom) => 0.6 + zoom * 0.25;

  // Get current narrator position for dot nudging
  const getNarratorPosition = () => {
    const currentStage = introStage ?? 0;
    const currentStory = copy.story?.[currentStage];
    const hasTargetId = currentStory?.targetId;

    // If showing narrator (no targetId), return its position
    if (!hasTargetId && currentStory?.lng && currentStory?.lat) {
      return {
        lng: parseFloat(currentStory.lng),
        lat: parseFloat(currentStory.lat)
      };
    }

    // Also check if narrator is still visible from a previous stage
    if (narratorIcons.length > 0) {
      return {
        lng: parseFloat(narratorIcons[0].lng),
        lat: parseFloat(narratorIcons[0].lat)
      };
    }

    return null;
  };

  // Nudge dot position away from narrator if too close
  const nudgeAwayFromNarrator = (dotX, dotY, narratorPos, threshold = 0.005, nudgeAmount = 0.005) => {
    if (!narratorPos) return [dotX, dotY];

    const dx = dotX - narratorPos.lng;
    const dy = dotY - narratorPos.lat;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < threshold && distance > 0) {
      // Normalize direction and nudge away
      const nx = dx / distance;
      const ny = dy / distance;
      return [
        dotX + nx * nudgeAmount,
        dotY + ny * nudgeAmount
      ];
    }

    return [dotX, dotY];
  };

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

    const mustInclude = new Set(storyTargetIds);
    const dotsToProcess = [];
    const includedIds = new Set();

    // First, add all story target dots
    for (const dot of allDots) {
      if (mustInclude.has(dot._stableId)) {
        dotsToProcess.push(dot);
        includedIds.add(dot._stableId);
      }
    }

    // Then fill up to MAX_ICONS with dots that match current filters
    for (const dot of allDots) {
      if (dotsToProcess.length >= MAX_ICONS) break;
      if (includedIds.has(dot._stableId)) continue;
      if (!matchesFilters(dot, filters)) continue;
      dotsToProcess.push(dot);
    }

    const dotsToRender = spreadDotsToGrid(dotsToProcess);
    processedDots = [...dotsToRender].sort((a, b) => a[1] - b[1]);

    return processedDots;
  }

  // --- DATA LOADING ---
  async function loadData() {
    try {
      const [labelsRes, dotsRes, wavesRes, tilesRes] = await Promise.all([
        fetch("assets/labels_cleaned.json"),
        fetch("assets/interaction.json"),
        fetch("assets/waves.json"),
        fetch("assets/tiles/tile-manifest.txt")
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
      const tilesText = await tilesRes.text();
      validTiles = new Set(tilesText.trim().split("\n"));
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
    const currentFilters = filters; // Add this line

    const dataFilterExtension = new DataFilterExtension({ filterSize: 1 });

    const iconLayer = new IconLayer({
      id: "dots",
      data: sortedDots,

      iconAtlas: ICON_ATLAS,
      iconMapping: iconMapping,

      getPosition: (d) => {
        const narratorPos = getNarratorPosition();
        const [nudgedX, nudgedY] = nudgeAwayFromNarrator(d[0], d[1], narratorPos);

        const baseX = nudgedX * 256;
        const baseY = nudgedY * 256;
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
        // Only force-show story targets if we're still in the story
        if (storyActiveIndex >= 0) {
          if (d._stableId === storyActiveIndex) return 1;
          if (storyTargetIds.has(d._stableId)) return 1;
        }
        return matchesFilters(d, currentFilters) ? 1 : 0;
      },
      filterRange: [1, 1],
      extensions: [dataFilterExtension],

      updateTriggers: {
        getPosition: [wiggleOffset, selectedId, introStage, narratorIcons.length],
        getSize: [viewState.zoom],
        getFilterValue: [JSON.stringify(filters), storyActiveIndex]
      },

      onClick: ({ object }) => {
        if (!object) return;
        const viewport = deck.getViewports()[0];
        if (!viewport) return;

        // Apply same nudging as getPosition
        const narratorPos = getNarratorPosition();
        const [nudgedX, nudgedY] = nudgeAwayFromNarrator(object[0], object[1], narratorPos);

        const [x, y] = viewport.project([nudgedX * 256, nudgedY * 256]);
        popupInfo = {
          x,
          y: y - getIconSize(viewState.zoom) * ICON_POPUP_OFFSET,
          data: object,
          nudgedPosition: [nudgedX, nudgedY] // Store nudged position for updates
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

    // Narrator icon layer
    const narratorLayer = new IconLayer({
      id: "narrator",
      data: narratorIcons,
      getPosition: (d) => [parseFloat(d.lng) * 256, parseFloat(d.lat) * 256],
      getIcon: () => ({
        url: "assets/icons/narrator.png",
        width: 128,
        height: 128,
        anchorY: 128
      }),
      getSize: () => getIconSize(viewState.zoom) * 2,
      getColor: (d) => [255, 255, 255, Math.floor(d.opacity * 255)],
      sizeScale: 1,
      sizeUnits: "pixels",
      pickable: true,
      billboard: true,
      parameters: { depthTest: false },
      updateTriggers: {
        getSize: [viewState.zoom],
        getColor: [narratorIcons.map(n => n.opacity).join(',')],
        getPosition: [narratorIcons.map(n => `${n.lng},${n.lat}`).join(';')]
      },
      onClick: ({ object }) => {
        if (!object || object.opacity < 1) return;
        const viewport = deck.getViewports()[0];
        if (!viewport) return;
        const [x, y] = viewport.project([parseFloat(object.lng) * 256, parseFloat(object.lat) * 256]);
        narratorPopupInfo = {
          x,
          y: y - getIconSize(viewState.zoom) * NARRATOR_POPUP_OFFSET,
          text: object.text
        };
      }
    });

    const layers = [
      waveLayer,
      shallowWaterLayer,
      tileLayer,
      iconLayer,
      narratorLayer,
      ...createLabelLayers(allLabels, viewState.zoom, fontLoaded)
    ].filter(Boolean);

    deck.setProps({ layers });
  }

  // --- EXPORTED METHODS ---
  export function focus() {
    canvasElement?.focus();
  }

  export function animateOpacity(targetOpacity, duration = 500) {
    opacityAnimator.animate(backgroundOpacity, targetOpacity, duration);
  }

  export function flyTo(targetX, targetY, zoom) {
    // Calculate distance from current position
    const currentTarget = viewState.target || [128, 128, 0];
    const currentZoom = viewState.zoom || 2;

    const dx = targetX - currentTarget[0];
    const dy = targetY - currentTarget[1];
    const panDistance = Math.sqrt(dx * dx + dy * dy);

    // Zoom change as "distance" - each zoom level is significant travel
    const zoomChange = Math.abs(zoom - currentZoom);
    const zoomDistance = zoomChange * 30; // Scale zoom change to comparable units

    // Combined distance
    const totalDistance = panDistance + zoomDistance;

    // Scale duration based on total distance
    // Short distance: 1000ms minimum
    // Long distance: 2500ms maximum
    const minDuration = 1000;
    const maxDuration = 2500;
    const minDistance = 10;
    const maxDistance = 150;

    const normalizedDistance = Math.max(0, Math.min(1, (totalDistance - minDistance) / (maxDistance - minDistance)));
    const transitionDuration = minDuration + normalizedDistance * (maxDuration - minDuration);

    const newViewState = {
      target: [targetX, targetY, 0],
      zoom,
      minZoom: 0,
      maxZoom: 6,
      transitionDuration,
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

    // Apply same nudging as getPosition
    const narratorPos = getNarratorPosition();
    const [nudgedX, nudgedY] = nudgeAwayFromNarrator(dot[0], dot[1], narratorPos);

    const [x, y] = viewport.project([nudgedX * 256, nudgedY * 256]);
    popupInfo = {
      x,
      y: y - getIconSize(viewState.zoom) * ICON_POPUP_OFFSET,
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

    // Set initial zoom - use story[0].zoom for stage 0, otherwise use responsive zoom
    const isStoryStart = (introStage ?? 0) === 0;
    if (isStoryStart && copy.story?.[0]?.zoom) {
      // Keep the zoom from getInitialViewState (story[0].zoom)
    } else {
      viewState = { ...viewState, zoom: getInitialZoom() };
    }

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
        const key = `${z}/${x}/${y}`;
        if (!validTiles.has(key)) {
          return null;
        }

        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
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
      controller: { doubleClickZoom: true, keyboard: { moveSpeed: -50 } },
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
        const viewport = deck.getViewports()[0];
        if (!viewport) return;

        // Update regular popup position
        if (popupInfo?.data) {
          // Recalculate nudged position in case narrator moved
          const narratorPos = getNarratorPosition();
          const [nudgedX, nudgedY] = nudgeAwayFromNarrator(popupInfo.data[0], popupInfo.data[1], narratorPos);

          const [newX, newY] = viewport.project([
            nudgedX * 256,
            nudgedY * 256
          ]);
          const y = newY - getIconSize(viewState.zoom) * ICON_POPUP_OFFSET;
          if (popupInfo.x !== newX || popupInfo.y !== y) {
            popupInfo = { ...popupInfo, x: newX, y };
          }
        }

        // Update narrator popup position
        if (narratorPopupInfo) {
          const currentStory = copy.story?.[introStage ?? 0];
          if (currentStory?.lng && currentStory?.lat) {
            const [newX, newY] = viewport.project([
              parseFloat(currentStory.lng) * 256,
              parseFloat(currentStory.lat) * 256
            ]);
            const y = newY - getIconSize(viewState.zoom) * NARRATOR_POPUP_OFFSET;
            if (narratorPopupInfo.x !== newX || narratorPopupInfo.y !== y) {
              narratorPopupInfo = { ...narratorPopupInfo, x: newX, y };
            }
          }
        }
      },
      onClick: ({ object }) => {
        if (object) {
          const viewport = deck.getViewports()[0];
          if (!viewport) return;

          // Apply same nudging as getPosition
          const narratorPos = getNarratorPosition();
          const [nudgedX, nudgedY] = nudgeAwayFromNarrator(object[0], object[1], narratorPos);

          const [x, y] = viewport.project([nudgedX * 256, nudgedY * 256]);
          popupInfo = {
            x,
            y: y - getIconSize(viewState.zoom) * ICON_POPUP_OFFSET,
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
    const newFilterKey = JSON.stringify(filters);
    if (newFilterKey !== processedDotsFilterKey) {
      processedDotsFilterKey = newFilterKey;
      processedDots = null; // Only clear cache when filters change
    }
    storyActiveIndex;
    if (deck) renderDeck();
  });

  // Handle narrator icons when introStage changes
  let prevIntroStage = -999; // Use a value that won't match any real index
  let prevNarratorPosition = { lng: null, lat: null };
  let fadeInterval = null; // Track current fade animation

  $effect(() => {
    const currentStage = introStage ?? 0;
    const currentStory = copy.story?.[currentStage];

    console.log('Narrator effect running:', { currentStage, prevIntroStage, hasTargetId: currentStory?.targetId, text: currentStory?.text?.substring(0, 30) });

    if (currentStage !== prevIntroStage) {
      console.log('Stage changed, updating narrator');

      // Cancel any ongoing fade animation
      if (fadeInterval) {
        clearInterval(fadeInterval);
        fadeInterval = null;
      }

      const hasTargetId = currentStory?.targetId;
      const showNarrator = !hasTargetId && currentStory?.lng && currentStory?.lat;

      // Check if narrator position will change
      const newPosition = showNarrator ? { lng: currentStory.lng, lat: currentStory.lat } : null;
      const positionChanged = !newPosition ||
        prevNarratorPosition.lng !== newPosition?.lng ||
        prevNarratorPosition.lat !== newPosition?.lat;
      const wasShowingNarrator = narratorIcons.length > 0;

      // Clear popup when changing stages
      narratorPopupInfo = null;

      if (hasTargetId) {
        // Fly to the targetId dot's position
        const targetId = parseInt(currentStory.targetId, 10);
        const dots = getProcessedDots();
        const dot = dots.find((d) => d._stableId === targetId);
        if (dot && deck) {
          const targetX = dot[0] * 256;
          const targetY = dot[1] * 256;
          const zoom = currentStory.zoom ? parseFloat(currentStory.zoom) : viewState.zoom;
          flyTo(targetX, targetY, zoom);
        }
        // Keep narrator visible - don't fade out for targetId stages
        // Narrator stays at its previous position
      } else if (currentStory?.lng && currentStory?.lat && currentStory?.zoom && deck) {
        // Fly to the story's lng/lat position
        const targetX = parseFloat(currentStory.lng) * 256;
        const targetY = parseFloat(currentStory.lat) * 256;
        const zoom = parseFloat(currentStory.zoom);
        flyTo(targetX, targetY, zoom);
      }

      if (showNarrator) {
        const newText = currentStory.text;

        if (wasShowingNarrator && !positionChanged) {
          // Position didn't change - just update the text without fading
          narratorIcons = [{
            id: 0,
            lng: currentStory.lng,
            lat: currentStory.lat,
            opacity: 1,
            text: newText
          }];
          activeNarratorId = 0;

          // Show popup immediately
          setTimeout(() => {
            if (deck && introStage === currentStage) {
              const viewport = deck.getViewports()[0];
              if (viewport) {
                const [x, y] = viewport.project([parseFloat(currentStory.lng) * 256, parseFloat(currentStory.lat) * 256]);
                narratorPopupInfo = {
                  x,
                  y: y - getIconSize(viewState.zoom) * NARRATOR_POPUP_OFFSET,
                  text: newText
                };
              }
            }
          }, 100);
        } else {
          // Position changed or narrator wasn't showing - fade in
          narratorIcons = [{
            id: 0,
            lng: currentStory.lng,
            lat: currentStory.lat,
            opacity: 0,
            text: newText
          }];
          activeNarratorId = 0;

          // Fade in animation (faster: 0.1 per tick instead of 0.05)
          let opacity = 0;
          fadeInterval = setInterval(() => {
            opacity += 0.1;
            if (opacity >= 1) {
              clearInterval(fadeInterval);
              fadeInterval = null;
              narratorIcons = narratorIcons.map(n => ({ ...n, opacity: 1 }));
              if (deck) renderDeck();
            } else {
              narratorIcons = narratorIcons.map(n => ({ ...n, opacity }));
              if (deck) renderDeck();
            }
          }, 30);

          // Show popup after fade in completes
          setTimeout(() => {
            if (deck && introStage === currentStage) {
              const viewport = deck.getViewports()[0];
              if (viewport) {
                const [x, y] = viewport.project([parseFloat(currentStory.lng) * 256, parseFloat(currentStory.lat) * 256]);
                narratorPopupInfo = {
                  x,
                  y: y - getIconSize(viewState.zoom) * NARRATOR_POPUP_OFFSET,
                  text: newText
                };
              }
            }
          }, 350);
        }

        // Update previous position
        prevNarratorPosition = { lng: currentStory.lng, lat: currentStory.lat };
      }
      // Note: We no longer fade out narrator when going to targetId story
      // The narrator stays visible at its previous position

      prevIntroStage = currentStage;
    }
  });
</script>

<div class="map-container">
  <canvas bind:this={canvasElement} class="deck-canvas" tabindex="0"></canvas>
  <Popup bind:popupInfo />
  <NarratorPopup bind:narratorPopupInfo />

  {#if introStage >= copy.story.length - 1}
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
    outline: none;
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
