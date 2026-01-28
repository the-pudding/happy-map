<script>
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import FilterPanel from "$components/happy-map/Filter.happymap.svelte";
  import InfoPanel from "$components/happy-map/Info.happymap.svelte";
  import Compass from "$components/happy-map/Compass.happymap.svelte";
  import Popup from "$components/happy-map/Popup.happymap.svelte";
  import IntroText from "$components/happy-map/IntroText.happymap.svelte";

  import {
    Deck,
    OrthographicView,
    TransitionInterpolator
  } from "@deck.gl/core";
  import { TileLayer } from "@deck.gl/geo-layers";
  import { BitmapLayer, IconLayer, TextLayer } from "@deck.gl/layers";

  import {
    matchesFilters,
    getIconName,
    getLabelSize,
    shuffle,
    getInitialZoom,
    DEFAULT_FILTERS,
    OUTLINE_OFFSETS
  } from "$components/helpers/textUtils.js";
  import copy from "$data/copy.json";

  // --- STATE ---
  let canvasElement;
  let deck = null;
  let tileLayer = null;
  let backgroundOpacity = $state(1);
  let opacityAnimationFrame = null;

  let introStage = $state(0);
  let introShown = $state(true);
  let infoShown = $state(false);
  let isFilterPanelOpen = $state(false);

  let storyActiveIndex = $state(-1);
  let popupInfo = $state(null);

  const maxIcons = 2000;

  let filters = $state({ ...DEFAULT_FILTERS });

  // --- DATA STATE ---
  let allLabels = $state([]);
  let allDots = [];

  // --- VIEW STATE ---
  let viewState = $state({
    target: [128, 128, 0],
    zoom: 2,
    minZoom: 0,
    maxZoom: 6
  });

  // --- DATA LOADING ---
  async function loadData() {
    try {
      const [labelsRes, dotsRes] = await Promise.all([
        fetch("assets/labels_cleaned.json"),
        fetch("assets/interaction.json")
      ]);

      const labelsRaw = await labelsRes.json();
      const TYPE_RANK = { l1: 1000, l2: 500, l3: 1 };
      labelsRaw.forEach((l, index) => {
        l._random = Math.random();
        l._uniqueId = `lbl_${index}`;
      });
      allLabels = labelsRaw.sort((a, b) => {
        const rankA = TYPE_RANK[a.type] || 0;
        const rankB = TYPE_RANK[b.type] || 0;
        if (rankA !== rankB) return rankB - rankA;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b._random - a._random;
      });

      const rawDots = await dotsRes.json();
      rawDots.forEach((d, i) => (d._stableId = i));
      const shuffled = shuffle(rawDots);
      allDots = shuffled.sort((a, b) => {
        const scoreA = a.rank_score ?? -Infinity;
        const scoreB = b.rank_score ?? -Infinity;
        return scoreB - scoreA;
      });
    } catch (err) {
      console.error("Error loading data:", err);
    }
  }

  // --- RENDER ---
  function renderDeck() {
    if (!deck) return;

    try {
      const testViewports = deck.getViewports();
      if (!testViewports || testViewports.length === 0) {
        requestAnimationFrame(() => renderDeck());
        return;
      }
    } catch (e) {
      requestAnimationFrame(() => renderDeck());
      return;
    }

    // Filter Dots
    const dotsToRender = [];

    if (storyActiveIndex !== -1) {
      const storyDot = allDots.find((d) => d._stableId === storyActiveIndex);
      if (storyDot) {
        storyDot._isActive = true;
        dotsToRender.push(storyDot);
      }
    }

    let dotsCount = 0;
    for (let i = 0; i < allDots.length; i++) {
      const p = allDots[i];
      if (storyActiveIndex !== -1 && p._stableId === storyActiveIndex) continue;
      if (dotsCount >= maxIcons) break;
      if (!matchesFilters(p, filters)) continue;
      p._isActive = false;
      dotsToRender.push(p);
      dotsCount++;
    }

    // Icon Layer
    const iconLayer = new IconLayer({
      id: "dots",
      data: dotsToRender,
      getPosition: (d) => [d[0] * 256, d[1] * 256],
      getIcon: (d) => {
        const name = getIconName(d);
        const suffix = d._isActive ? "-active" : "-default";
        return {
          url: `assets/icons/${name}${suffix}.png`,
          width: 60,
          height: 60,
          mask: false,
          anchorY: 60
        };
      },
      getSize: () => Math.max(30, Math.floor(viewState.zoom * 8)),
      getColor: (d) => {
        if (d._isActive) return [255, 255, 255, 255];
        return [255, 255, 255, Math.round(backgroundOpacity * 255)];
      },
      sizeScale: window.devicePixelRatio || 1,
      sizeUnits: "pixels",
      pickable: true,
      iconAtlas: null,
      iconMapping: null,
      alphaCutoff: 0,
      billboard: true,
      textureParameters: {
        minFilter: "linear",
        magFilter: "linear"
      },
      updateTriggers: {
        getColor: [backgroundOpacity, storyActiveIndex]
      },
      onClick: (info) => {
        if (info.object) {
          const viewport = deck.getViewports()[0];
          if (viewport) {
            const screenPos = viewport.project([info.object[0] * 256, info.object[1] * 256]);
            const iconSize = Math.max(30, Math.floor(viewState.zoom * 8));
            popupInfo = {
              x: screenPos[0],
              y: screenPos[1] - iconSize,
              data: info.object
            };
          }
        }
      }
    });

    // Filter labels based on zoom
    const currentZoomInt = Math.floor(viewState.zoom);
    const labelsToRender = allLabels.filter((l) => {
      if (l.type === "l1") return currentZoomInt < 5;
      if (l.type === "l2") return currentZoomInt >= 3;
      if (l.type === "l3") return currentZoomInt >= 4;
      return false;
    });

    const serifLabels = labelsToRender.filter((d) => d.type !== "l3");
    const sansLabels = labelsToRender.filter((d) => d.type === "l3");

    const serifShadowLayers = OUTLINE_OFFSETS.map(
      (offset, i) =>
        new TextLayer({
          id: `labels-serif-shadow-${i}`,
          data: serifLabels,
          getPosition: (d) => [d.x * 256, d.y * 256],
          getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
          getSize: (d) => getLabelSize(d.type, viewState.zoom),
          getColor: [0, 0, 0, 200],
          getPixelOffset: offset,
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          fontFamily: "Georgia, Times New Roman, serif",
          fontWeight: "800",
          sizeUnits: "pixels",
          billboard: true,
          updateTriggers: { getSize: [viewState.zoom] }
        })
    );

    const sansShadowLayers = OUTLINE_OFFSETS.map(
      (offset, i) =>
        new TextLayer({
          id: `labels-sans-shadow-${i}`,
          data: sansLabels,
          getPosition: (d) => [d.x * 256, d.y * 256],
          getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
          getSize: (d) => getLabelSize(d.type, viewState.zoom),
          getColor: [0, 0, 0, 200],
          getPixelOffset: offset,
          getTextAnchor: "middle",
          getAlignmentBaseline: "center",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontWeight: "400",
          sizeUnits: "pixels",
          billboard: true,
          updateTriggers: { getSize: [viewState.zoom] }
        })
    );

    const serifTextLayer = new TextLayer({
      id: "labels-serif-main",
      data: serifLabels,
      getPosition: (d) => [d.x * 256, d.y * 256],
      getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
      getSize: (d) => getLabelSize(d.type, viewState.zoom),
      getColor: (d) => {
        if (d.type === "l1") return [255, 255, 255, 255];
        if (d.type === "l2") return [255, 224, 110, 255];
        return [255, 255, 255, 255];
      },
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: "Georgia, Times New Roman, serif",
      fontWeight: "800",
      sizeUnits: "pixels",
      billboard: true,
      updateTriggers: { getSize: [viewState.zoom] }
    });

    const sansTextLayer = new TextLayer({
      id: "labels-sans-main",
      data: sansLabels,
      getPosition: (d) => [d.x * 256, d.y * 256],
      getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
      getSize: (d) => getLabelSize(d.type, viewState.zoom),
      getColor: [255, 255, 255, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "400",
      sizeUnits: "pixels",
      billboard: true,
      updateTriggers: { getSize: [viewState.zoom] }
    });

    deck.setProps({
      layers: [
        tileLayer,
        iconLayer,
        ...serifShadowLayers,
        ...sansShadowLayers,
        serifTextLayer,
        sansTextLayer
      ]
    });
  }

  // --- LIFECYCLE ---
  onMount(async () => {
    await loadData();

    if (!canvasElement.offsetWidth || !canvasElement.offsetHeight) {
      canvasElement.style.width = "100%";
      canvasElement.style.height = "100%";
    }

    const startStep = copy.story[introStage];
    const initialZoom = getInitialZoom();

    viewState = {
      target: [128, 128, 0],
      zoom: initialZoom,
      minZoom: 0,
      maxZoom: 6
    };

    if (startStep && startStep.targetId !== undefined) {
      storyActiveIndex = Number(startStep.targetId);
    }

    tileLayer = new TileLayer({
      id: "tiles",
      minZoom: 0,
      maxZoom: 6,
      tileSize: 256,
      extent: [0, 0, 256, 256],
      refinementStrategy: "best-available",
      getTileData: async (tile) => {
        const { x, y, z } = tile.index;
        const url = `assets/tiles/${z}/${x}/${y}.png`;
        try {
          const response = await fetch(url);
          if (!response.ok) return null;
          const blob = await response.blob();
          const img = new Image();
          img.crossOrigin = "anonymous";
          return new Promise((resolve) => {
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(blob);
          });
        } catch (e) {
          return null;
        }
      },
      renderSubLayers: (props) => {
        if (!props.data) return null;
        const { left, top, right, bottom } = props.tile.bbox;
        return new BitmapLayer({
          id: props.id,
          image: props.data,
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
      getCursor: ({ isDragging, isHovering }) => {
        if (isDragging) return "grabbing";
        if (isHovering) return "pointer";
        return "grab";
      },
      onViewStateChange: ({ viewState: newViewState, interactionState }) => {
        viewState = newViewState;

        if (interactionState?.isDragging) {
          popupInfo = null;
        }

        if (deck) renderDeck();
      },
      onAfterRender: () => {
        // Update popup position after each render
        if (popupInfo && popupInfo.data) {
          const dot = popupInfo.data;
          const viewport = deck.getViewports()[0];
          if (viewport) {
            const screenPos = viewport.project([dot[0] * 256, dot[1] * 256]);
            const iconSize = Math.max(30, Math.floor(viewState.zoom * 8));

            // Only update if position actually changed
            const newX = screenPos[0];
            const newY = screenPos[1] - iconSize;

            if (
              Math.abs(popupInfo.x - newX) > 0.5 ||
              Math.abs(popupInfo.y - newY) > 0.5
            ) {
              popupInfo = {
                ...popupInfo,
                x: newX,
                y: newY
              };
            }
          }
        }
      },
      onClick: (info) => {
        if (!info.object) popupInfo = null;
      },
      onLoad: () => {
        renderDeck();
        setTimeout(showStoryPopup, 500);
      }
    });
  });

  onDestroy(() => {
    if (deck) deck.finalize();
    if (opacityAnimationFrame) cancelAnimationFrame(opacityAnimationFrame);
  });

  $effect(() => {
    const _ = JSON.stringify(filters);
    const __ = introStage;
    if (deck) renderDeck();
  });

  // --- POPUP ---
  function showStoryPopup() {
    if (storyActiveIndex === -1 || !deck) return;
    const dot = allDots.find((d) => d._stableId === storyActiveIndex);
    if (!dot) return;
    const viewport = deck.getViewports()[0];
    if (!viewport) return;
    const screenPos = viewport.project([dot[0] * 256, dot[1] * 256]);
    popupInfo = { x: screenPos[0], y: screenPos[1], data: dot };
  }

  // --- ANIMATION ---
  class OrthographicFlyToInterpolator extends TransitionInterpolator {
    constructor(opts = {}) {
      super({
        compare: ["target", "zoom"],
        extract: ["target", "zoom"],
        required: ["target", "zoom"]
      });
      this.speed = opts.speed || 1.2;
    }

    interpolateProps(startProps, endProps, t) {
      const { zoom: startZoom, target: startTarget } = startProps;
      const { zoom: endZoom, target: endTarget } = endProps;

      const dx = endTarget[0] - startTarget[0];
      const dy = endTarget[1] - startTarget[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      const zoomOutAmount = Math.min(2, Math.log2(1 + distance / 100) * 0.8);

      const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
      const easeInOut = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

      const panT = easeOutCubic(t);
      const target = [
        startTarget[0] + (endTarget[0] - startTarget[0]) * panT,
        startTarget[1] + (endTarget[1] - startTarget[1]) * panT,
        0
      ];

      const easedT = easeInOut(t);
      const zoomDip = Math.sin(t * Math.PI) * zoomOutAmount;
      const linearZoom = startZoom + (endZoom - startZoom) * easedT;
      const zoom = linearZoom - zoomDip;

      return { target, zoom };
    }
  }

  function animateOpacity(targetOpacity, duration = 500) {
    if (opacityAnimationFrame) cancelAnimationFrame(opacityAnimationFrame);

    const startOpacity = backgroundOpacity;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      backgroundOpacity = startOpacity + (targetOpacity - startOpacity) * eased;
      if (deck) renderDeck();
      if (progress < 1) opacityAnimationFrame = requestAnimationFrame(step);
    }

    opacityAnimationFrame = requestAnimationFrame(step);
  }

  // --- NAVIGATION ---
  function stepToggle(t) {
    if (t == 2) {
      introShown = false;
      storyActiveIndex = -1;
      popupInfo = null;
      animateOpacity(1);
      renderDeck();
      return;
    }

    introStage += t;
    const stageData = copy.story[introStage];

    if (stageData.targetId !== undefined) {
      storyActiveIndex = Number(stageData.targetId);
      showStoryPopup();
    } else {
      storyActiveIndex = -1;
      popupInfo = null;
    }

    animateOpacity(stageData?.isolate == 1 ? 0.3 : 1);

    const targetX = introStage == 0 ? 128 : Number(stageData.lng) * 256;
    const targetY = introStage == 0 ? 128 : Number(stageData.lat) * 256;
    const zoom = introStage == 0 ? getInitialZoom() : stageData.zoom;

    const newViewState = {
      ...viewState,
      target: [targetX, targetY, 0],
      zoom,
      transitionDuration: 2500,
      transitionInterpolator: new OrthographicFlyToInterpolator()
    };

    viewState = newViewState;
    if (deck) deck.setProps({ initialViewState: newViewState });
  }

  function infoToggle(x) {
    infoShown = x;
    if (x) isFilterPanelOpen = false;
  }

  function filterToggle() {
    isFilterPanelOpen = !isFilterPanelOpen;
    if (isFilterPanelOpen) infoShown = false;
  }
</script>

<div class="wrapper">
  <canvas bind:this={canvasElement} class="deck-canvas"></canvas>
  <Popup bind:popupInfo />

  {#if !introShown}
    <div transition:fade>
      <Compass {deck} {viewState} />
    </div>
  {/if}
</div>

{#if !introShown}
  <button class="filterButton" onclick={filterToggle} transition:fade
    >Filter Responses</button
  >
  <button id="showinfo" onclick={() => infoToggle(!infoShown)} transition:fade
    >Show info</button
  >
  <FilterPanel bind:filters bind:isOpen={isFilterPanelOpen} />
  <InfoPanel bind:isOpen={infoShown} />
{/if}

{#if introShown}
  <div transition:fade>
    <IntroText {introStage} onStep={stepToggle} />
  </div>
{/if}

<style>
</style>
