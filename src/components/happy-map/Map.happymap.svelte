<script>
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { Deck, OrthographicView, LinearInterpolator, TransitionInterpolator } from "@deck.gl/core";
  import { TileLayer } from "@deck.gl/geo-layers";
  import { BitmapLayer, IconLayer, TextLayer } from "@deck.gl/layers";
  import {
    convertCountries,
    getFontSize
  } from "$components/helpers/textUtils.js";
  import copy from "$data/copy.json";
  import Text from "$components/happy-map/Text.happymap.svelte";

  // --- STATE ---
  let canvasElement;
  let mapContainer;
  let compassContainer;
  let deck = null;
  let tileLayer = null;  // Persistent tile layer - created once

  let introStage = $state(0);
  let introShown = $state(true);
  let infoShown = $state(false);
  let isFilterPanelOpen = $state(false);

  // Track the active story point (by _stableId)
  let storyActiveIndex = $state(-1);

  // Popup State
  let popupInfo = $state(null); // { x, y, data }

  // Icon limit - set to Infinity for no limit
  let maxIcons = 2000;

  // Initial Filter State
  let filters = $state({
    location: { us: true, nonUs: true },
    age: {
      range1: true,
      range2: true,
      range3: true,
      range4: true,
      range5: true,
      range6: true,
      range7: true
    },
    sex: { m: true, f: true, o: true },
    parent: { yes: true, no: true },
    marital: { single: true, married: true, divorced: true }
  });

  // --- DATA STATE ---
  let allLabels = $state([]);
  let allDots = [];

  // --- VIEW STATE (DeckGL) ---
  let viewState = $state({
    target: [128, 128, 0],
    zoom: 2,
    minZoom: 0,
    maxZoom: 6
  });

  // Compass Viewport State
  let viewportLeft = $state(20);
  let viewportTop = $state(20);
  let viewportWidth = $state(140);
  let viewportHeight = $state(140);

  // --- HELPERS ---
  function toggleGroup(groupName, value) {
    const keys = Object.keys(filters[groupName]);
    keys.forEach((key) => (filters[groupName][key] = value));
  }

  // --- FILTER LOGIC ---
  function matchesFilters(p) {
    const isUS = p[4] === "USA";
    if (isUS && !filters.location.us) return false;
    if (!isUS && !filters.location.nonUs) return false;

    const age = p[3];
    if (isNaN(age)) return false;
    if (age < 20 && !filters.age.range1) return false;
    else if (age >= 20 && age < 30 && !filters.age.range2) return false;
    else if (age >= 30 && age < 40 && !filters.age.range3) return false;
    else if (age >= 40 && age < 50 && !filters.age.range4) return false;
    else if (age >= 50 && age < 60 && !filters.age.range5) return false;
    else if (age >= 60 && age < 70 && !filters.age.range6) return false;
    else if (age >= 70 && age < 100 && !filters.age.range7) return false;
    else if (age >= 100) return false;

    const sex = p[5];
    if (sex === "m" && !filters.sex.m) return false;
    else if (sex === "f" && !filters.sex.f) return false;
    else if (sex !== "m" && sex !== "f" && !filters.sex.o) return false;

    const isParent = p[7] === "y";
    if (isParent && !filters.parent.yes) return false;
    if (!isParent && !filters.parent.no) return false;

    const marital = p[6].toLowerCase();
    if (marital.includes("single") && !filters.marital.single) return false;
    else if (marital.includes("married") && !filters.marital.married)
      return false;
    else if (marital.includes("divorced") && !filters.marital.divorced)
      return false;

    return true;
  }

  function getIconName(p) {
    const age = p[3];
    const sexChar = p[5];
    let ageGroup = "young";
    if (age > 60) ageGroup = "older";
    else if (age > 40) ageGroup = "old";
    else if (age > 25) ageGroup = "mid";
    const sex = sexChar === "m" ? "male" : "female";
    const variant = (p._stableId || 0) % 6;
    return `${ageGroup}-${sex}-${variant}`;
  }

  // --- DATA LOADING ---
  function shuffle(array) {
    let currentIndex = array.length,
      randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex]
      ];
    }
    return array;
  }

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

  function renderDeck() {
    if (!deck) return;

    // Check if deck is ready
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

    const currentStory = introShown ? copy.story[introStage] : null;
    const isIsolate = currentStory?.isolate == 1;

    // Maximum number of icons to show
    const maxIcons = 2000;

    // Filter Dots
    const dotsToRender = [];

    // 1. Always add the active story dot first
    if (storyActiveIndex !== -1) {
      const storyDot = allDots.find((d) => d._stableId === storyActiveIndex);
      if (storyDot) {
        storyDot._isActive = true;
        dotsToRender.push(storyDot);
      }
    }

    // 2. Add background dots (only if NOT in isolate mode)
    if (!isIsolate) {
      let dotsCount = 0;

      for (let i = 0; i < allDots.length; i++) {
        const p = allDots[i];

        // Skip the active story dot (already added)
        if (storyActiveIndex !== -1 && p._stableId === storyActiveIndex) continue;

        // Stop if we've reached the limit
        if (dotsCount >= maxIcons) break;

        // Filter check
        if (!matchesFilters(p)) continue;

        p._isActive = false;
        dotsToRender.push(p);
        dotsCount++;
      }
    }

    // Icon Layer (recreated on each render to update data)
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
          mask: false
        };
      },
      getSize: (d) => {
        const base = Math.max(30, Math.floor(viewState.zoom * 8));
        return d._isActive ? base * 1.5 : base;
      },
      sizeScale: 1,
      pickable: true,
      updateTriggers: {
        getIcon: [viewState.zoom],
        getSize: [viewState.zoom]
      },
      onClick: (info) => {
        if (info.object) {
          popupInfo = {
            x: info.x,
            y: info.y,
            data: info.object
          };
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

    // Helper to get label size based on type and zoom
    const getLabelSize = (d) => {
      const zoom = viewState.zoom;
      if (d.type === "l1") {
        if (zoom < 1) return 10;
        if (zoom < 2) return 12;
        if (zoom < 3) return 16;
        if (zoom < 4) return 22;
        if (zoom < 5) return 30;
        return 40;
      }
      if (d.type === "l2") {
        if (zoom < 4) return 12;
        if (zoom < 5) return 18;
        return 24;
      }
      // l3
      if (zoom < 5) return 10;
      if (zoom < 6) return 14;
      return 18;
    };

    // Shadow/outline offsets (in pixels) - creates outline effect
    const outlineOffsets = [
      [-2, -2], [-2, 0], [-2, 2],
      [0, -2],          [0, 2],
      [2, -2],  [2, 0],  [2, 2],
      // Extra offset for drop shadow
      [0, 3]
    ];

    // Create shadow layers (black text behind) - one set per font family
    const serifLabels = labelsToRender.filter(d => d.type !== "l3");
    const sansLabels = labelsToRender.filter(d => d.type === "l3");

    const serifShadowLayers = outlineOffsets.map((offset, i) =>
      new TextLayer({
        id: `labels-serif-shadow-${i}`,
        data: serifLabels,
        getPosition: (d) => [d.x * 256, d.y * 256],
        getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
        getSize: getLabelSize,
        getColor: [0, 0, 0, 200],
        getPixelOffset: offset,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Georgia, Times New Roman, serif",
        fontWeight: "800",
        sizeUnits: "pixels",
        billboard: true,
        updateTriggers: {
          getSize: [viewState.zoom]
        }
      })
    );

    const sansShadowLayers = outlineOffsets.map((offset, i) =>
      new TextLayer({
        id: `labels-sans-shadow-${i}`,
        data: sansLabels,
        getPosition: (d) => [d.x * 256, d.y * 256],
        getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
        getSize: getLabelSize,
        getColor: [0, 0, 0, 200],
        getPixelOffset: offset,
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontWeight: "400",
        sizeUnits: "pixels",
        billboard: true,
        updateTriggers: {
          getSize: [viewState.zoom]
        }
      })
    );

    // Main colored text layers (on top)
    const serifTextLayer = new TextLayer({
      id: "labels-serif-main",
      data: serifLabels,
      getPosition: (d) => [d.x * 256, d.y * 256],
      getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
      getSize: getLabelSize,
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
      updateTriggers: {
        getSize: [viewState.zoom]
      }
    });

    const sansTextLayer = new TextLayer({
      id: "labels-sans-main",
      data: sansLabels,
      getPosition: (d) => [d.x * 256, d.y * 256],
      getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
      getSize: getLabelSize,
      getColor: [255, 255, 255, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: "400",
      sizeUnits: "pixels",
      billboard: true,
      updateTriggers: {
        getSize: [viewState.zoom]
      }
    });

    // Use the persistent tileLayer (created in onMount)
    deck.setProps({
      layers: [tileLayer, iconLayer, ...serifShadowLayers, ...sansShadowLayers, serifTextLayer, sansTextLayer]
    });

    updateLabels();
    updateCompassViewport();
  }

  // Current zoom for reference
  let currentZoom = $state(2);

  function updateLabels() {
    // Labels are now rendered via TextLayer, this function is kept for compatibility
    // but doesn't need to do anything for labels anymore
  }

  function updateCompassViewport() {
    if (!compassContainer || !deck) return;

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
  }

  onMount(async () => {
    await loadData();

    if (!canvasElement.offsetWidth || !canvasElement.offsetHeight) {
      canvasElement.style.width = "100%";
      canvasElement.style.height = "100%";
    }

    const startStep = copy.story[introStage];

    let initialZoom = 2;
    if (typeof window !== "undefined") {
      const w = window.innerWidth;
      initialZoom = w < 500 ? 0 : w < 900 ? 1 : 2;
    }

    viewState = {
      target: [128, 128, 0],
      zoom: initialZoom,
      minZoom: 0,
      maxZoom: 6
    };

    if (startStep && startStep.targetId !== undefined) {
      storyActiveIndex = Number(startStep.targetId);
    }

    // Create TileLayer ONCE - it maintains internal cache state
    tileLayer = new TileLayer({
      id: "tiles",
      minZoom: 0,
      maxZoom: 6,
      tileSize: 256,
      extent: [0, 0, 256, 256],

      getTileData: async (tile) => {
        const { x, y, z } = tile.index;
        // XYZ format - no Y flip needed
        const url = `assets/tiles/${z}/${x}/${y}.png`;

        try {
          const response = await fetch(url);
          if (!response.ok) return null;  // Silently handle missing tiles

          const blob = await response.blob();
          const img = new Image();
          img.crossOrigin = "anonymous";

          return new Promise((resolve) => {
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(blob);
          });
        } catch (e) {
          return null;  // Silently handle network errors
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
      controller: {
        doubleClickZoom: false,
        keyboard: false
      },
      views: new OrthographicView({
        id: "ortho"
      }),
      onViewStateChange: ({ viewState: newViewState }) => {
        viewState = newViewState;
        popupInfo = null;
        if (deck) {
          renderDeck();
        }
      },
      onDraw: () => {
        // Update labels on every frame for smooth positioning during zoom/pan
        updateLabels();
        updateCompassViewport();
      },
      onClick: (info) => {
        if (!info.object) popupInfo = null;
      },
      onLoad: () => {
        renderDeck();
      }
    });
  });

  onDestroy(() => {
    if (deck) deck.finalize();
  });

  $effect(() => {
    const _ = JSON.stringify(filters);
    const __ = introStage;
    if (deck) {
      renderDeck();
    }
  });

  // Custom FlyTo interpolator for OrthographicView
  // Zooms out, pans, then zooms back in
  class OrthographicFlyToInterpolator extends TransitionInterpolator {
    constructor(opts = {}) {
      super({
        compare: ['target', 'zoom'],
        extract: ['target', 'zoom'],
        required: ['target', 'zoom']
      });
      this.speed = opts.speed || 1.2;
    }

    interpolateProps(startProps, endProps, t) {
      const startZoom = startProps.zoom;
      const endZoom = endProps.zoom;
      const startTarget = startProps.target;
      const endTarget = endProps.target;

      // Calculate the minimum zoom (zoom out point)
      const dx = endTarget[0] - startTarget[0];
      const dy = endTarget[1] - startTarget[1];
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Gentler zoom out - max 2 zoom levels, scaled by distance
      const zoomOutAmount = Math.min(2, Math.log2(1 + distance / 100) * 0.8);
      const minZoom = Math.max(0, Math.min(startZoom, endZoom) - zoomOutAmount);

      // Smooth easing using cosine for gentler animation
      const easeInOut = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

      // Interpolate target linearly with easing
      const easedT = easeInOut(t);
      const target = [
        startTarget[0] + (endTarget[0] - startTarget[0]) * easedT,
        startTarget[1] + (endTarget[1] - startTarget[1]) * easedT,
        0
      ];

      // Zoom follows a bell curve - out then back in
      // Use sin curve for smooth zoom out and back in
      const zoomDip = Math.sin(t * Math.PI) * zoomOutAmount;
      const linearZoom = startZoom + (endZoom - startZoom) * easedT;
      const zoom = linearZoom - zoomDip;

      return { target, zoom };
    }
  }

  function stepToggle(t) {
    if (t == 2) {
      introShown = false;
      storyActiveIndex = -1;
      popupInfo = null;
      renderDeck();
      return;
    }
    introStage += t;

    const stageData = copy.story[introStage];
    popupInfo = null;

    if (stageData.targetId !== undefined) {
      storyActiveIndex = Number(stageData.targetId);
    } else {
      storyActiveIndex = -1;
    }

    let newViewState;

    if (introStage == 0) {
      const w = window.innerWidth;
      const initialZoom = w < 500 ? 0 : w < 900 ? 1 : 2;

      newViewState = {
        ...viewState,
        target: [128, 128, 0],
        zoom: initialZoom,
        transitionDuration: 3500,
        transitionInterpolator: new OrthographicFlyToInterpolator()
      };
    } else {
      const targetX = Number(stageData.lng) * 256;
      const targetY = Number(stageData.lat) * 256;

      newViewState = {
        ...viewState,
        target: [targetX, targetY, 0],
        zoom: stageData.zoom,
        transitionDuration: 3500,
        transitionInterpolator: new OrthographicFlyToInterpolator()
      };
    }

    // Update local state
    viewState = newViewState;

    // Tell DeckGL to transition to new view state
    if (deck) {
      deck.setProps({
        initialViewState: newViewState
      });
    }

    setTimeout(() => {
      if (storyActiveIndex !== -1) {
        const dot = allDots.find((d) => d._stableId === storyActiveIndex);
        if (dot && deck) {
          const viewport = deck.getViewports()[0];
          const screenPos = viewport.project([dot[0] * 256, dot[1] * 256]);
          popupInfo = {
            x: screenPos[0],
            y: screenPos[1],
            data: dot
          };
        }
      }
    }, 2100);
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
  <!-- DeckGL Canvas -->
  <canvas bind:this={canvasElement} class="deck-canvas"></canvas>

  <!-- Custom Popup -->
  {#if popupInfo}
    <div
      class="popup-container"
      style="left: {popupInfo.x}px; top: {popupInfo.y}px;"
    >
      <div class="popup-content">
        <button class="popup-close" onclick={() => (popupInfo = null)}>×</button
        >
        <div class="info">
          {Math.round(popupInfo.data[3])} / {popupInfo.data[5].toUpperCase()} / {convertCountries(
            popupInfo.data[4]
          )}
          <br />
          <span>
            {popupInfo.data[6].charAt(0).toUpperCase() +
              popupInfo.data[6].slice(1)} /
            {popupInfo.data[7] == "y" ? "Parent" : "Not a parent"}
          </span>
          {#if popupInfo.data._stableId !== undefined}
            <br /><span class="debug-id">ID: {popupInfo.data._stableId}</span>
          {/if}
        </div>
        <div class="quote">{popupInfo.data[2]}</div>
      </div>
    </div>
  {/if}

  {#if !introShown}
    <!-- Compass -->
    <div class="compass" bind:this={compassContainer} transition:fade>
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
  {/if}
</div>

<!-- FILTER BUTTON -->
{#if !introShown}
  <button class="filterButton" onclick={filterToggle} transition:fade
    >Filter Responses</button
  >

  <div class="filterPanel {isFilterPanelOpen ? 'open' : ''}">
    <button class="close-panel-btn" onclick={filterToggle}>×</button>
    <h4>Filter Responses</h4>
    <!-- Filter Groups -->
    <div class="filter-group">
      <div class="group-header">
        <div class="group-title">Location</div>
        <div class="group-actions">
          <button onclick={() => toggleGroup("location", true)}>All</button
          ><button onclick={() => toggleGroup("location", false)}>None</button>
        </div>
      </div>
      <label
        ><input type="checkbox" bind:checked={filters.location.us} /> U.S.</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.location.nonUs} /> Non-U.S.</label
      >
    </div>
    <div class="filter-group">
      <div class="group-header">
        <div class="group-title">Age</div>
        <div class="group-actions">
          <button onclick={() => toggleGroup("age", true)}>All</button><button
            onclick={() => toggleGroup("age", false)}>None</button
          >
        </div>
      </div>
      <label
        ><input type="checkbox" bind:checked={filters.age.range1} /> Under 20</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.age.range2} /> 20 - 29</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.age.range3} /> 30 - 39</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.age.range4} /> 40 - 49</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.age.range5} /> 50 - 59</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.age.range6} /> 60 - 69</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.age.range7} /> 70+</label
      >
    </div>
    <div class="filter-group">
      <div class="group-header">
        <div class="group-title">Sex</div>
        <div class="group-actions">
          <button onclick={() => toggleGroup("sex", true)}>All</button><button
            onclick={() => toggleGroup("sex", false)}>None</button
          >
        </div>
      </div>
      <label><input type="checkbox" bind:checked={filters.sex.m} /> Male</label>
      <label
        ><input type="checkbox" bind:checked={filters.sex.f} /> Female</label
      >
      <label><input type="checkbox" bind:checked={filters.sex.o} /> Other</label
      >
    </div>
    <div class="filter-group">
      <div class="group-header">
        <div class="group-title">Parental Status</div>
        <div class="group-actions">
          <button onclick={() => toggleGroup("parent", true)}>All</button
          ><button onclick={() => toggleGroup("parent", false)}>None</button>
        </div>
      </div>
      <label
        ><input type="checkbox" bind:checked={filters.parent.yes} /> Parent</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.parent.no} /> Not Parent</label
      >
    </div>
    <div class="filter-group">
      <div class="group-header">
        <div class="group-title">Marital Status</div>
        <div class="group-actions">
          <button onclick={() => toggleGroup("marital", true)}>All</button
          ><button onclick={() => toggleGroup("marital", false)}>None</button>
        </div>
      </div>
      <label
        ><input type="checkbox" bind:checked={filters.marital.single} /> Single</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.marital.married} /> Married</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.marital.divorced} /> Divorced</label
      >
    </div>
  </div>

  <button id="showinfo" onclick={() => infoToggle(!infoShown)} transition:fade
    >Show info</button
  >

  <div class="infoPanel {infoShown ? 'open' : ''}">
    <button class="close-panel-btn" onclick={() => infoToggle(false)}>×</button>
    <h1>happy map</h1>
    <div class="byline">
      by <a href="https://pudding.cool/author/alvin-chang/" target="_blank"
        >alvin chang</a
      >
    </div>
    <div class="info-content"><Text copy={copy.info} /></div>
  </div>
{/if}

{#if introShown}
  <div class="introText" transition:fade>
    <Text copy={copy.story[introStage].text} />
    <div class="buttonContainer">
      {#if introStage > 0}
        <button class="prev" onclick={() => stepToggle(-1)}>Back</button>
      {/if}
      {#if introStage < copy.story.length - 1}
        <button class="next" onclick={() => stepToggle(1)}>Next</button>
      {:else}
        <button class="explore next" onclick={() => stepToggle(2)}
          >Explore</button
        >
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(body),
  :global(html) {
    margin: 0;
    padding: 0;
    height: 100vh;
    width: 100%;
    overflow: hidden;
  }
  .wrapper {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: #1e3d54;
    z-index: 1;
    overflow: hidden;
  }

  /* DeckGL Canvas */
  .deck-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Labels Layer (HTML Overlay) */
  .labels-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
  }
  .map-label {
    position: absolute;
    pointer-events: none;
    text-align: center;
    white-space: nowrap;
    line-height: 1.2;
    transform: translate(-50%, -50%);
  }
  .map-label span {
    display: block;
    white-space: nowrap;
  }

  /* Label Styles */
  .label-l1 span {
    font-family: var(--serif);
    font-weight: 800;
    color: #ffffff;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    text-shadow:
      2px 0 0 #000,
      -2px 0 0 #000,
      0 2px 0 #000,
      0 -2px 0 #000,
      1px 1px 0 #000,
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000,
      0 4px 8px rgba(0, 0, 0, 0.9);
    font-size: 14px;
  }
  .zoom-0 .label-l1 span {
    letter-spacing: 1px;
    font-size: 10px;
  }
  .zoom-1 .label-l1 span {
    letter-spacing: 2px;
    font-size: 12px;
  }
  .zoom-2 .label-l1 span {
    letter-spacing: 3px;
    font-size: 16px;
  }
  .zoom-3 .label-l1 span {
    letter-spacing: 5px;
    font-size: 22px;
  }
  .zoom-4 .label-l1 span {
    letter-spacing: 7px;
    font-size: 32px;
  }
  .zoom-5 .label-l1 span {
    letter-spacing: 10px;
    font-size: 45px;
  }
  .zoom-6 .label-l1 span {
    letter-spacing: 13px;
    font-size: 60px;
  }

  .label-l2 span {
    font-family: var(--serif);
    font-weight: 400;
    color: #ffe06e;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-shadow:
      1px 1px 0 #000,
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000,
      1px 0 0 #000,
      -1px 0 0 #000,
      0 1px 0 #000,
      0 -1px 0 #000,
      0 2px 4px rgba(0, 0, 0, 0.9);
    font-size: 12px;
  }
  .zoom-3 .label-l2 span {
    font-size: 14px;
  }
  .zoom-4 .label-l2 span {
    font-size: 22px;
  }
  .zoom-5 .label-l2 span {
    font-size: 30px;
  }
  .zoom-6 .label-l2 span {
    font-size: 40px;
  }

  .label-l3 span {
    font-family: var(--sans);
    font-weight: 400;
    color: #ffffff;
    text-transform: none;
    text-shadow:
      1px 1px 0 #000,
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000,
      0 1px 3px rgba(0, 0, 0, 1);
    font-size: 11px;
  }
  .zoom-4 .label-l3 span {
    font-size: 16px;
  }
  .zoom-5 .label-l3 span {
    font-size: 22px;
  }
  .zoom-6 .label-l3 span {
    font-size: 28px;
  }

  /* Popup Styles */
  .popup-container {
    position: absolute;
    transform: translate(-50%, -100%);
    z-index: 100;
    pointer-events: auto;
    padding-bottom: 20px;
  }
  .popup-content {
    background: white;
    color: #333;
    padding: 10px;
    border-radius: 4px;
    box-shadow: 0 3px 14px rgba(0, 0, 0, 0.4);
    width: 280px;
    font-family: var(--sans);
    position: relative;
  }
  .popup-content::after {
    content: "";
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 8px 8px 0;
    border-style: solid;
    border-color: white transparent transparent transparent;
  }
  .popup-close {
    position: absolute;
    top: 5px;
    right: 5px;
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #666;
  }
  .popup-content .info {
    font-size: 12px;
    color: #666;
    margin-bottom: 5px;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .popup-content .info span {
    color: #888;
    text-transform: none;
  }
  .popup-content .quote {
    font-size: 14px;
    line-height: 1.4;
    color: #000;
    font-family: var(--serif);
  }
  .debug-id {
    font-size: 9px;
    color: #88a;
    letter-spacing: 0.5px;
    display: block;
    margin-top: 2px;
  }

  /* Compass */
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

  /* Filter UI */
  .filterButton,
  #showinfo {
    position: absolute;
    right: 10px;
    background: #002436;
    border: 1px solid #264a5c;
    color: white;
    padding: 8px 12px;
    cursor: pointer;
    font-family: var(--sans);
    z-index: 9;
    border-radius: 4px;
    font-size: 15px;
  }
  .filterButton {
    top: 10px;
  }
  #showinfo {
    top: 50px;
  }
  .filterPanel,
  .infoPanel {
    font-family: var(--sans);
    position: absolute;
    right: 0;
    top: 0;
    height: 100vh;
    background: #001126;
    color: white;
    z-index: 99999;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    border-left: 1px solid #264a5c;
    box-shadow: -5px 0 15px rgba(0, 0, 0, 0.5);
    overflow-y: auto;
  }
  .filterPanel {
    width: 240px;
    padding: 60px 15px 15px;
  }
  .infoPanel {
    width: 350px;
    padding: 60px 25px 25px;
  }
  .open {
    transform: translateX(0);
  }

  .filterPanel h4 {
    margin: 0 0 10px 0;
    font-size: 13px;
    font-weight: bold;
    border-bottom: 1px solid #264a5c;
    padding-bottom: 6px;
  }
  .filter-group {
    margin-bottom: 15px;
  }
  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .group-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9effdc;
    font-weight: bold;
  }
  .group-actions button {
    background: none;
    border: none;
    color: #5aa6cf;
    font-size: 10px;
    cursor: pointer;
    padding: 0 4px;
    text-transform: uppercase;
  }
  .group-actions button:hover {
    color: white;
    text-decoration: underline;
  }
  .filterPanel label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    cursor: pointer;
    font-size: 13px;
    color: #cbd5e1;
    user-select: none;
  }
  .filterPanel label:hover {
    color: white;
  }
  .filterPanel input[type="checkbox"] {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
    width: 18px;
    height: 18px;
    border: 1px solid #5aa6cf;
    border-radius: 3px;
    background-color: rgba(0, 36, 54, 0.5);
    display: grid;
    place-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;
  }
  .filterPanel input[type="checkbox"]:hover {
    border-color: #9effdc;
    background-color: rgba(158, 255, 220, 0.1);
  }
  .filterPanel input[type="checkbox"]::before {
    content: "";
    width: 10px;
    height: 10px;
    transform: scale(0);
    transition: 0.1s transform;
    background-color: #001126;
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
    box-shadow: inset 1em 1em #001126;
  }
  .filterPanel input[type="checkbox"]:checked {
    background-color: #9effdc;
    border-color: #9effdc;
  }
  .filterPanel input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  .close-panel-btn {
    position: absolute;
    top: 10px;
    left: 15px;
    background: none;
    border: none;
    color: #5aa6cf;
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }
</style>
