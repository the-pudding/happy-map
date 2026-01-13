<script>
  import { onMount } from "svelte";
  import "leaflet/dist/leaflet.css";
  import {
    convertCountries
  } from "$components/helpers/textUtils.js";

  let mapContainer;
  let compassContainer;
  let map;
  let L;

  // --- STATE ---
  let allLabels = [];
  let allDots = [];
  const activeLabelMarkers = new Map();
  const activeDotMarkers = new Map();

  // Cache for the dynamic person icons
  const iconCache = new Map();

  let zoom = 1;
  let viewportLeft = $state(20);
  let viewportTop = $state(20);
  let viewportWidth = $state(140);
  let viewportHeight = $state(140);

  const textWidthCache = new Map();
  let measureContext = null;
  let appFontFamily = "sans-serif";

  // --- COMPASS ---
  function updateCompassViewport() {
    if (!map || !compassContainer) return;

    // Get actual rendered size
    const cw = compassContainer.offsetWidth;

    // Calculate internal proportions based on original design (20px pad on 180px box = ~11.1%)
    const padding = cw * (20 / 180);
    const compassInnerSize = cw - (padding * 2);

    const bounds = map.getBounds();
    const mapBounds = [
      [0, 0],
      [-256, 256]
    ];

    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();

    const leftPercent =
      (west - mapBounds[0][1]) / (mapBounds[1][1] - mapBounds[0][1]);
    const rightPercent =
      (east - mapBounds[0][1]) / (mapBounds[1][1] - mapBounds[0][1]);

    // Update Math to use dynamic padding and innerSize
    viewportLeft = Math.max(
      padding,
      Math.min(padding + compassInnerSize, leftPercent * compassInnerSize + padding)
    );
    const right = Math.max(
      padding,
      Math.min(padding + compassInnerSize, rightPercent * compassInnerSize + padding)
    );
    viewportWidth = Math.max(5, right - viewportLeft);

    const topPercent =
      (mapBounds[0][0] - north) / (mapBounds[0][0] - mapBounds[1][0]);
    const bottomPercent =
      (mapBounds[0][0] - south) / (mapBounds[0][0] - mapBounds[1][0]);

    viewportTop = Math.max(
      padding,
      Math.min(padding + compassInnerSize, topPercent * compassInnerSize + padding)
    );
    const bottom = Math.max(
      padding,
      Math.min(padding + compassInnerSize, bottomPercent * compassInnerSize + padding)
    );
    viewportHeight = Math.max(5, bottom - viewportTop);
  }

  // Add these variables for the debug panel
  let clickX = $state(0);
  let clickY = $state(0);
  let normalizedX = $state(0);
  let normalizedY = $state(0);
  let showDebug = false;

  onMount(async () => {
    L = (await import("leaflet")).default;

    // 1. Resolve Fonts
    const computedStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--sans")
      .trim();
    if (computedStyle) appFontFamily = computedStyle;

    // 2. Initialize Canvas
    const canvas = document.createElement("canvas");
    measureContext = canvas.getContext("2d");

    // 3. MAP CONFIGURATION
    const mapSize = 256;
    const padding = mapSize * 0.5;
    const tileBounds = [[0, 0], [-mapSize, mapSize]];
    const expandedBounds = [[padding, -padding], [-mapSize - padding, mapSize + padding]];

    // --- NEW ZOOM LOGIC ---
    // Check width and set initial zoom
    const w = window.innerWidth;
    const initialZoom = w < 500 ? 0 : w < 900 ? 1 : 2;
    zoom = initialZoom;
    // ----------------------

    map = L.map(mapContainer, {
      crs: L.CRS.Simple,
      minZoom: 0,
      maxZoom: 6,
      zoomControl: false,
      preferCanvas: true,
      center: [-128, 128],
      zoom: initialZoom,
      maxBounds: expandedBounds,
      maxBoundsViscosity: 0.8,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 60
    });

    // --- A. WATER LAYER ---
    map.createPane("waterPane");
    map.getPane("waterPane").style.zIndex = 100;

    const WaterLayer = L.GridLayer.extend({
      createTile: function (coords) {
        const tile = document.createElement("div");
        tile.classList.add("water-tile");
        return tile;
      }
    });

    new WaterLayer({
      pane: "waterPane",
      tileSize: 256,
      minZoom: 0,
      maxZoom: 6
    }).addTo(map);

    // --- B. LAND LAYER ---
    L.tileLayer("assets/tiles/{z}/{x}/{y}.png", {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 6,
      noWrap: true,
      bounds: tileBounds,
      errorTileUrl: ""
    }).addTo(map);

    // --- C. INTERACTION & DEBUG ---

    // Debug Click Handler
    map.on("click", function (e) {
      const containerPoint = e.containerPoint;
      clickX = Math.round(containerPoint.x);
      clickY = Math.round(containerPoint.y);
      const latlng = e.latlng;
      normalizedX = Math.max(0, Math.min(1, latlng.lng / 256));
      normalizedY = Math.max(0, Math.min(1, -latlng.lat / 256));
    });

    // --- NEW: FUZZY DOT CLICKING ---
    map.on("click", (e) => {
      const clickPoint = e.containerPoint;
      const CLICK_THRESHOLD = 30;

      let minDistanceSq = CLICK_THRESHOLD * CLICK_THRESHOLD;
      let closestMarker = null;

      for (const marker of activeDotMarkers.values()) {
        const markerPoint = map.latLngToContainerPoint(marker.getLatLng());
        const dx = clickPoint.x - markerPoint.x;
        const dy = clickPoint.y - markerPoint.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestMarker = marker;
        }
      }

      if (closestMarker) {
        closestMarker.openPopup();
      }
    });

    // 4. Load Data
    await loadData();

    // 5. Render Loop
    let renderTimeout;
    const triggerRender = () => {
      clearTimeout(renderTimeout);
      renderTimeout = setTimeout(() => {
        renderViewport();
        updateCompassViewport();
      }, 30);
    };

    map.on("moveend zoomend", triggerRender);
    map.on("move zoom", updateCompassViewport);

    // Trigger render on popup events to swap icons (active/inactive)
    map.on("popupopen", triggerRender);
    map.on("popupclose", triggerRender);

    document.fonts.ready.then(triggerRender);
  });

  // --- DATA LOADING & SORTING ---
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

      allLabels = await labelsRes.json();
      const TYPE_RANK = { l1: 1000, l2: 500, l3: 1 };

      allLabels.forEach((l) => (l._random = Math.random()));
      allLabels.sort((a, b) => {
        const rankA = TYPE_RANK[a.type] || 0;
        const rankB = TYPE_RANK[b.type] || 0;
        if (rankA !== rankB) return rankB - rankA;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b._random - a._random;
      });

      const rawDots = await dotsRes.json();
      allDots = shuffle(rawDots);
    } catch (err) {
      console.error("Error loading data:", err);
    }
  }

  // --- MEASUREMENT HELPERS ---
  function getFontSize(type, currentZoom) {
    if (type === "l1") {
      switch (Math.floor(currentZoom)) {
      case 0:
          return 5;
        case 1:
          return 11;
        case 2:
          return 12;
        case 3:
          return 14;
        case 4:
          return 25;
        case 5:
          return 30;
        case 6:
          return 22;
        default:
          return 11;
      }
    } else if (type === "l2") {
      switch (Math.floor(currentZoom)) {
        case 2:
          return 9;
        case 3:
          return 12;
        case 4:
          return 19;
        case 5:
          return 23;
        case 6:
          return 28;
        default:
          return 9;
      }
    } else if (type === "l3") {
      switch (Math.floor(currentZoom)) {
        case 2:
          return 9;
        case 3:
          return 11;
        case 4:
          return 13;
        case 5:
          return 18;
        case 6:
          return 22;
        default:
          return 9;
      }
    }
    return 10;
  }

  function getPreciseWidth(text, type, currentZoom = 2) {
    const cacheKey = `${text}-${type}-${Math.floor(currentZoom)}`;
    if (textWidthCache.has(cacheKey)) return textWidthCache.get(cacheKey);

    const fontSize = getFontSize(type, currentZoom);
    if (type === "l1")
      measureContext.font = `800 ${fontSize}px ${appFontFamily}`;
    else measureContext.font = `400 ${fontSize}px ${appFontFamily}`;

    const width = measureContext.measureText(text).width;
    // Add L1 spacing to width calc
    if (type === "l1") {
      const letterSpacing =
        currentZoom <= 2
          ? 2
          : currentZoom === 3
            ? 5
            : currentZoom === 4
              ? 7
              : currentZoom === 5
                ? 10
                : 13;
      const additionalWidth = text.length * letterSpacing;
      textWidthCache.set(cacheKey, width + additionalWidth);
      return width + additionalWidth;
    }
    textWidthCache.set(cacheKey, width);
    return width;
  }

  // --- RENDER VIEWPORT ---
  function renderViewport() {
    if (!map) return;

    zoom = map.getZoom();

    const currentZoomInt = Math.floor(zoom);
    const bounds = map.getBounds();
    // Keep the pad to ensure labels don't pop in/out instantly at the edge
    const paddedBounds = bounds.pad(0.1);

    // --- A. DOTS RENDERING ---
    const visibleDotIndices = new Set();

    // Only show dots starting at Zoom 3
    if (zoom >= 0) {
      const maxDots = zoom*200; //zoom >= 5 ? 1000 : 300;
      let dotsCount = 0;
      for (let i = 0; i < allDots.length; i++) {
        if (dotsCount >= maxDots) break;
        const p = allDots[i];
        const pLat = -(p[1] * 256);
        const pLng = p[0] * 256;
        if (
          pLat > bounds.getSouth() &&
          pLat < bounds.getNorth() &&
          pLng > bounds.getWest() &&
          pLng < bounds.getEast()
        ) {
          visibleDotIndices.add(i);
          dotsCount++;
        }
      }
    }

    // 1. Calculate Size based on Zoom
    const currentSize = Math.max(22, Math.floor(zoom * 7));

    // 2. Icon Caching Helper
    function getCachedIcon(baseName, isActive) {
      const stateSuffix = isActive ? "-active" : "";
      const cacheKey = `${baseName}${stateSuffix}-${currentSize}`;

      if (iconCache.has(cacheKey)) {
        return iconCache.get(cacheKey);
      }

      const icon = L.icon({
        iconUrl: `assets/icons/${baseName}${stateSuffix}.png`,
        iconSize: [currentSize, currentSize],
        iconAnchor: [currentSize / 2, currentSize / 2],
        popupAnchor: [0, -currentSize / 2],
        className: "interactive-dot"
      });

      iconCache.set(cacheKey, icon);
      return icon;
    }

    for (const index of visibleDotIndices) {
      // -- DETERMINE IMAGE PROPERTIES --
      const p = allDots[index];
      const age = p[3]; // Age is index 3
      const sexChar = p[5]; // Sex is index 5

      // Logic: Age Group
      let ageGroup = "young";
      if (age > 60) ageGroup = "older";
      else if (age > 40) ageGroup = "old";
      else if (age > 25) ageGroup = "mid";

      // Logic: Sex
      const sex = sexChar === "m" ? "male" : "female";

      // Logic: Random Variant (0-5)
      // Use index to ensure consistent randomness for the same person
      const variant = index % 6;

      // Final Filename Base: e.g., "mid1-male-3"
      const iconBaseName = `${ageGroup}-${sex}-${variant}`;

      if (activeDotMarkers.has(index)) {
        // Update existing marker
        const marker = activeDotMarkers.get(index);
        const isActive = marker.isPopupOpen();

        // Get the specific icon from cache
        const icon = getCachedIcon(iconBaseName, isActive);

        marker.setIcon(icon);
        marker.setZIndexOffset(isActive ? 1000 : 10);
        marker.getElement()?.classList.add("map-element-visible");

      } else {
        // Create NEW Marker
        const icon = getCachedIcon(iconBaseName, false);
        const marker = L.marker([-(p[1] * 256), p[0] * 256], {
          icon: icon,
          zIndexOffset: 10
        })
        .bindPopup(cleanPopup(p));

        marker.addTo(map);
        activeDotMarkers.set(index, marker);

        requestAnimationFrame(() =>
          marker.getElement()?.classList.add("map-element-visible")
        );
      }
    }

    // Cleanup invisible markers
    for (const [index, marker] of activeDotMarkers) {
      if (!visibleDotIndices.has(index)) {
        const el = marker.getElement();
        if(el) el.classList.remove("map-element-visible");
        activeDotMarkers.delete(index);
        setTimeout(() => {
          if (map.hasLayer(marker)) map.removeLayer(marker);
        }, 400);
      }
    }

    // --- B. LABELS RENDERING ---

    // 1. Filter: Which types are allowed at this zoom?
    let labelsToConsider = allLabels.filter((l) => {
      // Hide L1 labels from zoom 5 and beyond
      if (l.type === "l1") return currentZoomInt < 5;
      // Show L2 starting at zoom 3
      if (l.type === "l2") return currentZoomInt >= 3;
      // Show L3 starting at zoom 4
      if (l.type === "l3") return currentZoomInt >= 4;
      return false;
    });

    // 2. Sort: Just for z-index layering (L3 on top of L2, etc)
    labelsToConsider.sort((a, b) => {
      const typeRank = { l3: 3, l2: 2, l1: 1 };
      // Standard z-index stack: L3 > L2 > L1
      if (typeRank[a.type] !== typeRank[b.type])
        return typeRank[a.type] - typeRank[b.type];

      if (b.priority !== a.priority) return b.priority - a.priority;
      return b._random - a._random;
    });

    const hL1 = getFontSize("l1", zoom);
    const hL2 = getFontSize("l2", zoom);
    const hL3 = 10;

    const validLabelIds = new Set();

    // 3. Process Labels
    for (const l of labelsToConsider) {
      const lblLat = -(l.y * 256);
      const lblLng = l.x * 256;
      const latLng = L.latLng(lblLat, lblLng);

      // Basic optimization: Don't render DOM nodes if they are way off screen
      if (!paddedBounds.contains(latLng)) continue;

      const baseLineHeight =
        l.type === "l1" ? hL1 : l.type === "l2" ? hL2 : hL3;

      // Text Measurement (Still needed to center the icon correctly)
      const lines = l.text.split("\n");

      let maxLineWidth = 0;
      lines.forEach((lineText) => {
        const w = getPreciseWidth(lineText, l.type, zoom);
        if (w > maxLineWidth) maxLineWidth = w;
      });

      const calcWidth = maxLineWidth + 10;
      const calcHeight = baseLineHeight * lines.length * 1.2;

      const labelId = `${l.text}_${l.type}`;
      validLabelIds.add(labelId);

      const fontSize = getFontSize(l.type, zoom);

      const spansHtml = lines
        .map(
          (line) =>
            `<span style="display: block; white-space: nowrap !important; font-size: ${fontSize}px !important;">${line}</span>`
        )
        .join("");

      const containerHtml = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">${spansHtml}</div>`;

      const icon = L.divIcon({
        className: `map-label label-${l.type}`,
        html: containerHtml,
        iconSize: [calcWidth + 20, calcHeight + 10],
        iconAnchor: [(calcWidth + 20) / 2, (calcHeight + 10) / 2]
      });

      const zIndex =
        (l.type === "l3" ? 1000 : l.type === "l2" ? 500 : 1) +
        l.priority * 10;

      if (activeLabelMarkers.has(labelId)) {
        const marker = activeLabelMarkers.get(labelId);
        marker.setIcon(icon);
        marker.setZIndexOffset(zIndex);
        marker.getElement()?.classList.add("map-element-visible");
      } else {
        const marker = L.marker([lblLat, lblLng], {
          icon: icon,
          interactive: false,
          zIndexOffset: zIndex
        });
        marker.addTo(map);
        activeLabelMarkers.set(labelId, marker);
        requestAnimationFrame(() =>
          marker.getElement()?.classList.add("map-element-visible")
        );
      }
    }

    // Cleanup labels that fell out of zoom scope or viewport
    for (const [id, marker] of activeLabelMarkers) {
      if (!validLabelIds.has(id)) {
        const el = marker.getElement();
        if (el) el.classList.remove("map-element-visible");
        activeLabelMarkers.delete(id);
        setTimeout(() => {
          if (map.hasLayer(marker)) map.removeLayer(marker);
        }, 400);
      }
    }
  }

  function cleanPopup(p) {
    const info = `${Math.round(p[3])} / ${p[5].toUpperCase()} / ${convertCountries(p[4])}<br><span>${p[6].charAt(0).toUpperCase() + p[6].slice(1)} / ${p[7] == "y" ? "Parent" : "Not a parent"}</span>`
    return "<div class='info'>" + info + "</div><div class='quote'>" + p[2] + "</div>";
  }



  // Updated click handler
  function handleMapClick(event) {
    if (!map) return;

    // Get pixel coordinates relative to the map container
    const rect = event.currentTarget.getBoundingClientRect();
    clickX = Math.round(event.clientX - rect.left);
    clickY = Math.round(event.clientY - rect.top);

    // Convert pixel coordinates to Leaflet lat/lng
    const latlng = map.containerPointToLatLng([clickX, clickY]);

    // Convert from your map coordinate system back to normalized (0-1)
    // Your map uses: lat = -(y * 256), lng = x * 256
    // So to reverse: x = lng / 256, y = -lat / 256
    normalizedX = latlng.lng / 256;
    normalizedY = -latlng.lat / 256;

    // Clamp to 0-1 range to match your data
    normalizedX = Math.max(0, Math.min(1, normalizedX));
    normalizedY = Math.max(0, Math.min(1, normalizedY));
  }
</script>

<div class="wrapper">
  <!-- .map container is bound here -->
  <div
    class="map zoom-{Math.floor(zoom)}"
    bind:this={mapContainer}
  ></div>

  <div class="compass" bind:this={compassContainer}>
    <div
      class="viewport-box"
      style="left: {viewportLeft}px; top: {viewportTop}px; width: {viewportWidth}px; height: {viewportHeight}px;"
    ></div>
    <div class="yaxis"></div>
    <div class="compassLabel ylabel top">Immediate</div>
    <div class="compassLabel ylabel bottom">Requires planning</div>
    <div class="xaxis"></div>
    <div class="compassLabel xlabel left">Less agency</div>
    <div class="compassLabel xlabel right">More agency</div>
  </div>
</div>
{#if showDebug}
<textarea class="debug-panel">
    "x": {normalizedX.toFixed(4)},
    "y": {normalizedY.toFixed(4)},</textarea>
{/if}

<style>
  .debug-panel {
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 14px;
    z-index: 1000;
    z-index: 999999999;
    min-width: 150px; /* Add min width for better formatting */
  }

  .debug-panel div {
    margin: 2px 0;
  }

  :global(body),
  :global(html) {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  .wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: #1e3d54;
    z-index: 1;
  }

  .map {
    width: 100%;
    height: 100%;
    /* Keep a solid fallback color behind the tiles */
    background-color: #0c384a;
  }
  :global(.water-tile) {
    width: 256px;
    height: 256px;

    /* The Wave Pattern */
    background-image: url("data:image/svg+xml,%3Csvg width='64' height='32' viewBox='0 0 64 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 16 Q16 28 32 16 T64 16' fill='none' stroke='%2319566e' stroke-width='1.5' opacity='0.3'/%3E%3C/svg%3E");

    /* IMPORTANT: Must divide evenly into 256px to prevent seams */
    background-size: 64px 32px;

    background-repeat: repeat;
  }

 /* COMPASS */
  .compass {
    position: absolute;
    left: 10px;
    bottom: 10px;

    /* Responsive sizing logic */
    width: clamp(130px, 18vw, 180px);
    height: clamp(130px, 18vw, 180px);

    background: #002436;
    z-index: 999;
    border: 2px solid #264a5c;
    border-radius: 4px;
    overflow: hidden;
    font-family:  var(--sans);
  }

  .viewport-box {
    position: absolute;
    background: rgba(158, 255, 220, 0.3);
    pointer-events: none;
    z-index: 50;
    border-radius: 1px;
  }

  /* Update Axis to adjust to dynamic padding/size */
  .yaxis {
    position: absolute;
    left: 50%;
    /* Use percentage to stay proportional */
    top: 11%;
    height: 78%;
    border-left: 1px solid rgb(232, 249, 255);
    z-index: 60;
  }
  .xaxis {
    position: absolute;
    top: 50%;
    /* Use percentage to stay proportional */
    left: 11%;
    width: 78%;
    border-top: 1px solid rgb(232, 249, 255);
    z-index: 60;
  }

  .compassLabel {
    position: absolute;
    /* Scale font size slightly between 10px and 12px */
    font-size: clamp(10px, 1.2vw, 12px);
    line-height: 1;
    font-weight: 300;
    color: rgb(232, 249, 255);
    z-index: 70;
  }

  /* Keep these mostly the same, just reduced fixed pixels slightly */
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

  /* ELEMENTS */
  :global(.map-label),
  :global(.interactive-dot) {
    opacity: 1;
    transition: opacity 0.4s ease-in-out;
  }
  :global(.map-element-visible) {
    opacity: 1 !important;
  }
 :global(.interactive-dot) {
    cursor: pointer;
    transition:
      opacity 0.4s,
      width 0.2s,   /* smooth scaling on zoom */
      height 0.2s;
  }

  :global(.map-label) {
    background: transparent;
    border: none;
    text-align: center;
    white-space: nowrap !important;
    pointer-events: none;
    display: flex;
    justify-content: center;
    align-items: center;
    line-height: 1.2;
  }

  :global(.map-label span) {
    display: block;
    max-width: none !important;
    white-space: nowrap !important;
  }

  :global(.label-l1 span) {
    font-family: var(--serif);
    font-weight: 400;
    color: #ffffff;
    text-transform: uppercase;
    letter-spacing: 0.4em;
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
  }
  :global(.zoom-2 .label-l1 span) {
    letter-spacing: 2px;
  }
  :global(.zoom-3 .label-l1 span) {
    letter-spacing: 5px;
  }
  :global(.zoom-4 .label-l1 span) {
    letter-spacing: 7px;
  }

  :global(.label-l2 span) {
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
  }

  :global(.label-l3 span) {
    font-family: var(--sans);
    font-weight: 400;
    color: #ffffff;
    text-transform: none;
    letter-spacing: 0px;
    text-shadow:
      1px 1px 0 #000,
      -1px -1px 0 #000,
      1px -1px 0 #000,
      -1px 1px 0 #000,
      0 1px 3px rgba(0, 0, 0, 1);
  }

</style>
