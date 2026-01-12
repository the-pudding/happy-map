<script>
  import { onMount } from "svelte";
  import "leaflet/dist/leaflet.css";

  let mapContainer;
  let map;
  let L;

  // --- STATE ---
  let allLabels = [];
  let allDots = [];
  const activeLabelMarkers = new Map();
  const activeDotMarkers = new Map();

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
    if (!map) return;
    const bounds = map.getBounds();
    const mapBounds = [
      [0, 0],
      [-256, 256]
    ];
    const compassInnerSize = 140;

    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();

    const leftPercent =
      (west - mapBounds[0][1]) / (mapBounds[1][1] - mapBounds[0][1]);
    const rightPercent =
      (east - mapBounds[0][1]) / (mapBounds[1][1] - mapBounds[0][1]);

    viewportLeft = Math.max(
      20,
      Math.min(160, leftPercent * compassInnerSize + 20)
    );
    const right = Math.max(
      20,
      Math.min(160, rightPercent * compassInnerSize + 20)
    );
    viewportWidth = Math.max(5, right - viewportLeft);

    const topPercent =
      (mapBounds[0][0] - north) / (mapBounds[0][0] - mapBounds[1][0]);
    const bottomPercent =
      (mapBounds[0][0] - south) / (mapBounds[0][0] - mapBounds[1][0]);

    viewportTop = Math.max(
      20,
      Math.min(160, topPercent * compassInnerSize + 20)
    );
    const bottom = Math.max(
      20,
      Math.min(160, bottomPercent * compassInnerSize + 20)
    );
    viewportHeight = Math.max(5, bottom - viewportTop);
  }




// Add these variables for the debug panel
  let clickX = $state(0);
  let clickY = $state(0);
  let normalizedX = $state(0);
  let normalizedY = $state(0);
  let showDebug = true;

  onMount(async () => {
    L = (await import("leaflet")).default;

    // 1. Resolve Fonts
    const computedStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--sans")
      .trim();
    if (computedStyle) appFontFamily = computedStyle;

    // 2. Initialize Canvas for text measurement
    const canvas = document.createElement("canvas");
    measureContext = canvas.getContext("2d");

    // 3. MAP CONFIGURATION
    const mapSize = 256;
    const padding = mapSize * 0.5;

    // Bounds where land tiles actually exist
    const tileBounds = [
      [0, 0],
      [-mapSize, mapSize]
    ];

    // Expanded bounds to allow panning into the ocean
    const expandedBounds = [
      [padding, -padding],
      [-mapSize - padding, mapSize + padding]
    ];

    map = L.map(mapContainer, {
      crs: L.CRS.Simple,
      minZoom: 2,
      maxZoom: 6,
      zoomControl: false,
      preferCanvas: true,
      center: [-128, 128],
      zoom: 2,
      maxBounds: expandedBounds,
      maxBoundsViscosity: 0.8,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 60
    });

    // --- A. WATER LAYER (The Fix) ---
    // 1. Create a custom pane for water so it sits BEHIND land tiles
    map.createPane("waterPane");
    map.getPane("waterPane").style.zIndex = 100; // Standard tilePane is 200

    map.on("click", function (e) {
      // Get pixel coordinates
      const containerPoint = e.containerPoint;
      clickX = Math.round(containerPoint.x);
      clickY = Math.round(containerPoint.y);

      // Get the lat/lng from the click
      const latlng = e.latlng;

      // Convert to normalized coordinates (0-1)
      normalizedX = latlng.lng / 256;
      normalizedY = -latlng.lat / 256;

      // Clamp to 0-1 range
      normalizedX = Math.max(0, Math.min(1, normalizedX));
      normalizedY = Math.max(0, Math.min(1, normalizedY));
    });

    // 2. Define a Custom GridLayer that returns divs with the texture class
    const WaterLayer = L.GridLayer.extend({
      createTile: function (coords) {
        const tile = document.createElement("div");
        tile.classList.add("water-tile"); // Defined in CSS
        return tile;
      }
    });

    // 3. Add the Water Layer to the map
    new WaterLayer({
      pane: "waterPane", // Use the background pane
      tileSize: 256, // Match the land tile size
      minZoom: 0, // Visible at all zooms
      maxZoom: 6
    }).addTo(map);

    // --- B. LAND LAYER ---
    L.tileLayer("assets/tiles/{z}/{x}/{y}.png", {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 6,
      noWrap: true,
      bounds: tileBounds, // Limit land tiles to the world box
      errorTileUrl: ""
    }).addTo(map);

    // Snap view to the map initially
    map.fitBounds(tileBounds);

    // 4. Load Data & Setup Interactions
    await loadData();

    let renderTimeout;
    const triggerRender = () => {
      clearTimeout(renderTimeout);
      renderTimeout = setTimeout(() => {
        renderViewport(); // Calculates Dots and Labels (Heavy)
        updateCompassViewport();
      }, 30);
    };

    // Recalculate heavy DOM elements only when movement stops
    map.on("moveend zoomend", triggerRender);

    // Update lightweight UI (Compass) during movement for smoothness
    map.on("move zoom", updateCompassViewport);

    // Initial Render once fonts are loaded
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
          return 27;
        case 6:
          return 34;
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
    const paddedBounds = bounds.pad(0.1);
    const mapSize = map.getSize();

    // High Density Mode (Zoom 5+): Shows L3 first, hides L1
    const isHighDensityZoom = zoom >= 5;

    // --- A. DOTS RENDERING ---
    const visibleDotIndices = new Set();
    if (zoom >= 3) {
      const maxDots = isHighDensityZoom ? Infinity : 15000;
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

    const currentRadius = Math.max(1, zoom / 2);

    // Enter / Update Dots
    for (const index of visibleDotIndices) {
      if (activeDotMarkers.has(index)) {
        const marker = activeDotMarkers.get(index);
        marker.setRadius(currentRadius);
        marker.getElement()?.classList.add("map-element-visible");
      } else {
        const p = allDots[index];
        const marker = L.circleMarker([-(p[1] * 256), p[0] * 256], {
          radius: currentRadius,
          color: "#000000",
          weight: 0.1,
          fillColor: "#000000",
          fillOpacity: 0.2,
          className: "interactive-dot"
        }).bindPopup(`${p[2]}`);
        // .bindPopup(`l1. ${p[4]}<br>l2. ${p[5]}<br>l3. ${p[2]}`);
        marker.addTo(map);
        activeDotMarkers.set(index, marker);
        requestAnimationFrame(() =>
          marker.getElement()?.classList.add("map-element-visible")
        );
      }
    }

    // Exit Dots
    for (const [index, marker] of activeDotMarkers) {
      if (!visibleDotIndices.has(index)) {
        marker.getElement()?.classList.remove("map-element-visible");
        activeDotMarkers.delete(index);
        setTimeout(() => {
          if (map.hasLayer(marker)) map.removeLayer(marker);
        }, 400);
      }
    }

    // --- B. LABELS RENDERING ---

    // 1. Filter
    let labelsToConsider = allLabels.filter((l) => {
      // Hide L1 labels from zoom 5 and beyond
      if (l.type === "l1") return currentZoomInt < 5;
      if (l.type === "l2") return currentZoomInt >= 3;
      if (l.type === "l3") return currentZoomInt >= 4;
      return false;
    });

    // 2. Sort
    labelsToConsider.sort((a, b) => {
      // Use High Density logic at Zoom 5+ (L3 > L2 > L1)
      if (isHighDensityZoom) {
        const typeRank = { l3: 3, l2: 2, l1: 1 };
        if (typeRank[a.type] !== typeRank[b.type])
          return typeRank[b.type] - typeRank[a.type];
      } else {
        const typeRank = { l1: 3, l2: 2, l3: 1 };
        if (typeRank[a.type] !== typeRank[b.type])
          return typeRank[b.type] - typeRank[a.type];
      }
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b._random - a._random;
    });

    // 3. Grid Setup
    const cellSize = 50;
    const gridW = Math.ceil(mapSize.x / cellSize);
    const gridH = Math.ceil(mapSize.y / cellSize);
    const grid = new Array(gridW * gridH).fill(null);
    const addToGrid = (box) => {
      const startX = Math.floor(Math.max(0, box.l) / cellSize);
      const endX = Math.floor(Math.min(mapSize.x - 1, box.r) / cellSize);
      const startY = Math.floor(Math.max(0, box.t) / cellSize);
      const endY = Math.floor(Math.min(mapSize.y - 1, box.b) / cellSize);
      for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
          const idx = y * gridW + x;
          if (!grid[idx]) grid[idx] = [];
          grid[idx].push(box);
        }
      }
    };
    const checkCollision = (box) => {
      const startX = Math.floor(Math.max(0, box.l) / cellSize);
      const endX = Math.floor(Math.min(mapSize.x - 1, box.r) / cellSize);
      const startY = Math.floor(Math.max(0, box.t) / cellSize);
      const endY = Math.floor(Math.min(mapSize.y - 1, box.b) / cellSize);
      for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
          const idx = y * gridW + x;
          if (grid[idx]) {
            for (const other of grid[idx]) {
              if (
                box.l < other.r &&
                box.r > other.l &&
                box.t < other.b &&
                box.b > other.t
              )
                return true;
            }
          }
        }
      }
      return false;
    };

    const hL1 = getFontSize("l1", zoom);
    const hL2 = getFontSize("l2", zoom);
    const hL3 = 10;
    const densityBuffer = isHighDensityZoom ? 2 : (3.5 - zoom) * 4;
    const validLabelIds = new Set();

    // 4. Process Labels
    for (const l of labelsToConsider) {
      const lblLat = -(l.y * 256);
      const lblLng = l.x * 256;
      const latLng = L.latLng(lblLat, lblLng);

      if (!paddedBounds.contains(latLng)) continue;

      const pos = map.latLngToContainerPoint(latLng);
      const baseLineHeight =
        l.type === "l1" ? hL1 : l.type === "l2" ? hL2 : hL3;

      // Manual Line Breaks
      const lines = l.text.split("\n");

      let maxLineWidth = 0;
      lines.forEach((lineText) => {
        const w = getPreciseWidth(lineText, l.type, zoom);
        if (w > maxLineWidth) maxLineWidth = w;
      });

      // No Max Width constraints, just use calculated width + buffer
      const calcWidth = maxLineWidth + 10;
      const calcHeight = baseLineHeight * lines.length * 1.2;

      const boxWidth = Math.max(1, calcWidth + densityBuffer);
      const boxHeight = Math.max(1, calcHeight + densityBuffer * 0.5);

      const box = {
        l: pos.x - boxWidth / 2,
        r: pos.x + boxWidth / 2,
        t: pos.y - boxHeight / 2,
        b: pos.y + boxHeight / 2
      };

      if (box.r < 0 || box.l > mapSize.x || box.b < 0 || box.t > mapSize.y)
        continue;

      const isMandatory = l.priority >= 10;

      if (isMandatory || !checkCollision(box)) {
        addToGrid(box);
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
    }

    // Cleanup
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

  <div class="compass">
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

<textarea class="debug-panel">
    "x": {normalizedX.toFixed(4)},
    "y": {normalizedY.toFixed(4)},</textarea>

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
    width: 180px;
    height: 180px;
    background: #002436;
    z-index: 999;
    border: 2px solid #264a5c;
    border-radius: 4px;
    overflow: hidden;
  }
  .viewport-box {
    position: absolute;
    background: rgba(158, 255, 220, 0.3);
    pointer-events: none;
    z-index: 50;
    border-radius: 1px;
  }
  .yaxis {
    position: absolute;
    left: 50%;
    top: 20px;
    border-left: 1px solid rgb(232, 249, 255);
    height: calc(100% - 40px);
    z-index: 60;
  }
  .xaxis {
    position: absolute;
    top: 50%;
    left: 20px;
    border-top: 1px solid rgb(232, 249, 255);
    width: calc(100% - 40px);
    z-index: 60;
  }
  .compassLabel {
    position: absolute;
    font-size: 12px;
    line-height: 11px;
    font-weight: 300;
    color: rgb(232, 249, 255);
    z-index: 70;
  }
  .compassLabel.ylabel {
    width: 100%;
    text-align: center;
  }
  .compassLabel.xlabel {
    top: calc(50% - 10px);
    transform: translateY(-50%);
    text-align: center;
  }
  .compassLabel.top {
    top: 5px;
  }
  .compassLabel.bottom {
    bottom: 5px;
  }
  .compassLabel.left {
    left: 5px;
    text-align: left;
  }
  .compassLabel.right {
    right: 5px;
    text-align: right;
  }

  /* ELEMENTS */
  :global(.map-label),
  :global(.interactive-dot) {
    opacity: 0;
    transition: opacity 0.4s ease-in-out;
  }
  :global(.map-element-visible) {
    opacity: 1 !important;
  }
  :global(.interactive-dot) {
    cursor: pointer;
    transition:
      opacity 0.4s,
      r 0.2s;
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
    font-weight: 800;
    color: #ffffff;
    text-transform: uppercase;
    letter-spacing: 0.3em;
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
