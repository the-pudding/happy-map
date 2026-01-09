<script>
  import { onMount } from "svelte";
  import "leaflet/dist/leaflet.css";

  let mapContainer;
  let map;
  let L;

  // --- STATE & CACHE ---
  let allLabels = [];
  let allDots = [];

  // Persistent markers map for Diffing Strategy (prevents flickering on updates)
  const activeLabelMarkers = new Map(); // Key: labelId, Value: L.Marker
  const activeDotMarkers = new Map();   // Key: dotIndex, Value: L.CircleMarker

  let zoom = 1;

  // Viewport box positioning - reactive variables
  let viewportLeft = $state(20);
  let viewportTop = $state(20);
  let viewportWidth = $state(140);
  let viewportHeight = $state(140);

  // Text Measurement
  const textWidthCache = new Map();
  let measureContext = null;
  let appFontFamily = "sans-serif";

  // --- COMPASS LOGIC ---
  function updateCompassViewport() {
    if (!map) return;

    const bounds = map.getBounds();
    const mapBounds = [[0, 0], [-256, 256]];

    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();

    const compassInnerSize = 140;

    const leftPercent = ((west - mapBounds[0][1]) / (mapBounds[1][1] - mapBounds[0][1]));
    const rightPercent = ((east - mapBounds[0][1]) / (mapBounds[1][1] - mapBounds[0][1]));

    viewportLeft = Math.max(20, Math.min(160, leftPercent * compassInnerSize + 20));
    const right = Math.max(20, Math.min(160, rightPercent * compassInnerSize + 20));
    viewportWidth = Math.max(5, right - viewportLeft);

    const topPercent = ((mapBounds[0][0] - north) / (mapBounds[0][0] - mapBounds[1][0]));
    const bottomPercent = ((mapBounds[0][0] - south) / (mapBounds[0][0] - mapBounds[1][0]));

    viewportTop = Math.max(20, Math.min(160, topPercent * compassInnerSize + 20));
    const bottom = Math.max(20, Math.min(160, bottomPercent * compassInnerSize + 20));
    viewportHeight = Math.max(5, bottom - viewportTop);
  }

  // --- INITIALIZATION ---
  onMount(async () => {
    L = (await import("leaflet")).default;

    // 1. Resolve Fonts
    const computedStyle = getComputedStyle(document.documentElement).getPropertyValue("--sans").trim();
    if (computedStyle) appFontFamily = computedStyle;

    // 2. Canvas for Text Measurement
    const canvas = document.createElement("canvas");
    measureContext = canvas.getContext("2d");

    // 3. Map Config
    const mapSize = 256;
    const padding = mapSize * 0.5;
    const tileBounds = [[0, 0], [-mapSize, mapSize]];
    const expandedBounds = [[padding, -padding], [-mapSize - padding, mapSize + padding]];

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

    L.tileLayer("assets/tiles/{z}/{x}/{y}.png", {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 6,
      noWrap: true,
      bounds: tileBounds,
      errorTileUrl: ""
    }).addTo(map);

    map.fitBounds(tileBounds);

    await loadData();

    // 4. Render Loop
    let renderTimeout;
    const triggerRender = () => {
      clearTimeout(renderTimeout);
      renderTimeout = setTimeout(() => {
        renderViewport();
        updateCompassViewport();
      }, 30);
    };

    map.on("moveend zoomend", triggerRender);
    map.on("move zoom", updateCompassViewport); // Update compass smoothly during drag

    document.fonts.ready.then(triggerRender);
  });

  // --- DATA HANDLING ---
  function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
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

  // --- HELPERS ---
  function getFontSize(type, currentZoom) {
    if (type === "l1") {
      switch (Math.floor(currentZoom)) {
        case 2: return 11;
        case 3: return 14;
        case 4: return 16;
        case 5: return 18;
        case 6: return 22;
        default: return 11;
      }
    } else if (type === "l2") {
      switch (Math.floor(currentZoom)) {
        case 2: return 9;
        case 3: return 10;
        case 4: return 11;
        case 5: return 12;
        case 6: return 13;
        default: return 9;
      }
    }
    return 10; // l3
  }

  function getPreciseWidth(text, type, currentZoom = 2) {
    const cacheKey = `${text}-${type}-${Math.floor(currentZoom)}`;
    if (textWidthCache.has(cacheKey)) return textWidthCache.get(cacheKey);

    const fontSize = getFontSize(type, currentZoom);
    if (type === "l1") measureContext.font = `800 ${fontSize}px ${appFontFamily}`;
    else measureContext.font = `400 ${fontSize}px ${appFontFamily}`;

    const width = measureContext.measureText(text).width;
    if (type === "l1") {
      const letterSpacing = currentZoom <= 2 ? 2 : currentZoom === 3 ? 5 : currentZoom === 4 ? 7 : currentZoom === 5 ? 10 : 13;
      const additionalWidth = text.length * letterSpacing;
      textWidthCache.set(cacheKey, width + additionalWidth);
      return width + additionalWidth;
    }
    textWidthCache.set(cacheKey, width);
    return width;
  }

  function createCurvedLabel(text, lat, lng, type, zoom) {
    const pathId = `path-${lat}-${lng}`.replace(/\./g, "-");
    const fontSize = getFontSize(type, zoom);
    const letterSpacing = zoom <= 2 ? 2 : zoom === 3 ? 5 : zoom === 4 ? 7 : zoom === 5 ? 10 : 13;

    const textLength = text.length;
    const estimatedCharWidth = fontSize * 0.7;
    const totalTextWidth = (textLength * estimatedCharWidth) + (textLength * letterSpacing);
    const svgWidth = Math.max(300, totalTextWidth * 1.5);
    const svgHeight = fontSize * 4;
    const radius = Math.max(50, totalTextWidth * 0.4);

    const startX = svgWidth * 0.15;
    const endX = svgWidth * 0.85;
    const midX = svgWidth * 0.5;
    const midY = svgHeight/2 - (radius * 0.2);
    const baseY = svgHeight/2;

    const svg = `
      <svg width="${svgWidth}" height="${svgHeight}" style="position: absolute; pointer-events: none; overflow: visible;">
        <defs><path id="${pathId}" d="M ${startX},${baseY} Q ${midX},${midY} ${endX},${baseY}" fill="none"/></defs>
        <text style="
          font-family: var(--serif); font-size: ${fontSize}px; font-weight: 800;
          fill: #ffffff; text-transform: uppercase; letter-spacing: ${letterSpacing}px;
          text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 4px 8px rgba(0, 0, 0, 0.9);
        ">
          <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${text}</textPath>
        </text>
      </svg>
    `;
    return { html: svg, width: svgWidth, height: svgHeight };
  }

  // --- CORE RENDER FUNCTION ---
  function renderViewport() {
    if (!map) return;

    zoom = map.getZoom();
    const currentZoomInt = Math.floor(zoom);
    const bounds = map.getBounds();
    const paddedBounds = bounds.pad(0.1);
    const mapSize = map.getSize();
    const isMaxZoom = zoom >= 6;

    // --- A. DOTS RENDERING (Diffing) ---
    const visibleDotIndices = new Set();

    if (zoom >= 3) {
      const maxDots = isMaxZoom ? Infinity : 15000;
      let dotsCount = 0;

      for (let i = 0; i < allDots.length; i++) {
        if (dotsCount >= maxDots) break;
        const p = allDots[i];
        const pLat = -(p[1] * 256);
        const pLng = p[0] * 256;

        if (pLat > bounds.getSouth() && pLat < bounds.getNorth() &&
            pLng > bounds.getWest() && pLng < bounds.getEast()) {
          visibleDotIndices.add(i);
          dotsCount++;
        }
      }
    }

    const currentRadius = Math.max(1, zoom / 2);

    // 1. Enter / Update Dots
    for (const index of visibleDotIndices) {
      if (activeDotMarkers.has(index)) {
        // Update existing (no fade)
        const marker = activeDotMarkers.get(index);
        marker.setRadius(currentRadius);
        marker.getElement()?.classList.add('map-element-visible');
      } else {
        // Enter new (fade in)
        const p = allDots[index];
        const marker = L.circleMarker([-(p[1] * 256), p[0] * 256], {
          radius: currentRadius,
          color: "#000000",
          weight: 0.5,
          fillColor: "#000000",
          fillOpacity: 0.3,
          className: "interactive-dot" // CSS handles opacity: 0
        }).bindPopup(`l1. ${p[4]}<br>l2. ${p[5]}<br>l3. ${p[2]}`);

        marker.addTo(map);
        activeDotMarkers.set(index, marker);
        requestAnimationFrame(() => marker.getElement()?.classList.add('map-element-visible'));
      }
    }

    // 2. Exit Dots
    for (const [index, marker] of activeDotMarkers) {
      if (!visibleDotIndices.has(index)) {
        marker.getElement()?.classList.remove('map-element-visible');
        activeDotMarkers.delete(index);
        setTimeout(() => { if (map.hasLayer(marker)) map.removeLayer(marker); }, 400);
      }
    }


    // --- B. LABELS RENDERING (Diffing) ---

    // 1. Strict Filtering
    let labelsToConsider = allLabels.filter((l) => {
      if (l.type === "l1") return true;
      if (l.type === "l2") return currentZoomInt >= 3;
      if (l.type === "l3") return currentZoomInt >= 4;
      return false;
    });

    // 2. Dynamic Sorting
    labelsToConsider.sort((a, b) => {
      // At max zoom, prioritize L3 (small) over L1 (big) so all data shows
      if (isMaxZoom) {
        const typeRank = { l3: 3, l2: 2, l1: 1 };
        if (typeRank[a.type] !== typeRank[b.type]) return typeRank[b.type] - typeRank[a.type];
      } else {
        const typeRank = { l1: 3, l2: 2, l3: 1 };
        if (typeRank[a.type] !== typeRank[b.type]) return typeRank[b.type] - typeRank[a.type];
      }
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b._random - a._random;
    });

    // 3. Collision Grid Setup
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
              if (box.l < other.r && box.r > other.l && box.t < other.b && box.b > other.t) return true;
            }
          }
        }
      }
      return false;
    };

    // Style Constants
    const hL1 = getFontSize("l1", zoom);
    const hL2 = getFontSize("l2", zoom);
    const hL3 = 10;
    const densityBuffer = isMaxZoom ? 2 : (3.5 - zoom) * 4;

    // Width Thresholds
    const MAX_LABEL_WIDTH = 200; // L2, L3
    const MAX_L1_WIDTH = 250;    // L1 (triggers wrap if exceeded)

    const validLabelIds = new Set();

    // 4. Process Labels
    for (const l of labelsToConsider) {
      const lblLat = -(l.y * 256);
      const lblLng = l.x * 256;
      const latLng = L.latLng(lblLat, lblLng);

      if (!paddedBounds.contains(latLng)) continue;

      const pos = map.latLngToContainerPoint(latLng);
      const rawTxtWidth = getPreciseWidth(l.text, l.type, zoom);
      const baseLineHeight = l.type === "l1" ? hL1 : l.type === "l2" ? hL2 : hL3;

      let calcWidth = rawTxtWidth;
      let calcHeight = baseLineHeight;
      let isL1Wrapped = false;

      // Calculate Bounding Box
      if (l.type === "l1") {
        const fontSize = getFontSize(l.type, zoom);
        const letterSpacing = zoom <= 2 ? 2 : zoom === 3 ? 5 : zoom === 4 ? 7 : zoom === 5 ? 10 : 13;
        const textLength = l.text.length;
        const estimatedCharWidth = fontSize * 0.7;
        const totalTextWidth = (textLength * estimatedCharWidth) + (textLength * letterSpacing);

        // Check against Max Width
        if (totalTextWidth > MAX_L1_WIDTH) {
          isL1Wrapped = true;
          calcWidth = MAX_L1_WIDTH;
          const charsPerLine = MAX_L1_WIDTH / (estimatedCharWidth + letterSpacing);
          const estimatedLines = Math.ceil(textLength / charsPerLine);
          calcHeight = (fontSize * 1.2) * estimatedLines;
        } else {
          calcWidth = Math.max(300, totalTextWidth * 1.5);
          calcHeight = fontSize * 4;
        }
      } else if (rawTxtWidth > MAX_LABEL_WIDTH) {
        calcWidth = MAX_LABEL_WIDTH;
        const estimatedLines = Math.ceil(rawTxtWidth / MAX_LABEL_WIDTH);
        calcHeight = baseLineHeight * estimatedLines * 1.2;
      }

      const boxWidth = Math.max(1, calcWidth + densityBuffer);
      const boxHeight = Math.max(1, calcHeight + densityBuffer * 0.5);
      const box = {
        l: pos.x - boxWidth / 2, r: pos.x + boxWidth / 2,
        t: pos.y - boxHeight / 2, b: pos.y + boxHeight / 2
      };

      if (box.r < 0 || box.l > mapSize.x || box.b < 0 || box.t > mapSize.y) continue;

      const isMandatory = l.priority >= 10;

      // Check Collision
      if (isMandatory || !checkCollision(box)) {
        addToGrid(box);
        const labelId = `${l.text}_${l.type}`;
        validLabelIds.add(labelId);

        // Create Icon
        let icon;
        if (l.type === "l1") {
          if (isL1Wrapped) {
             const fontSize = getFontSize(l.type, zoom);
             icon = L.divIcon({
              className: `map-label label-${l.type} wrapped`, // Wrapped HTML
              html: `<span style="font-size: ${fontSize}px !important;">${l.text}</span>`,
              iconSize: [calcWidth + 20, calcHeight + 10],
              iconAnchor: [(calcWidth + 20) / 2, (calcHeight + 10) / 2]
            });
          } else {
             const curved = createCurvedLabel(l.text, lblLat, lblLng, l.type, zoom);
             icon = L.divIcon({
              className: `map-label label-${l.type} curved-label`, // Curved SVG
              html: curved.html,
              iconSize: [curved.width, curved.height],
              iconAnchor: [curved.width / 2, curved.height / 2]
            });
          }
        } else {
          const fontSize = getFontSize(l.type, zoom);
          icon = L.divIcon({
            className: `map-label label-${l.type} ${rawTxtWidth > MAX_LABEL_WIDTH ? 'wrapped' : ''}`,
            html: `<span style="font-size: ${fontSize}px !important;">${l.text}</span>`,
            iconSize: [calcWidth + 20, calcHeight + 10],
            iconAnchor: [(calcWidth + 20) / 2, (calcHeight + 10) / 2]
          });
        }

        const zIndex = (l.type === 'l3' ? 1000 : l.type === 'l2' ? 500 : 1) + l.priority * 10;

        // Diffing: Enter vs Update
        if (activeLabelMarkers.has(labelId)) {
          const marker = activeLabelMarkers.get(labelId);
          marker.setIcon(icon); // Update size/shape
          marker.setZIndexOffset(zIndex);
          marker.getElement()?.classList.add('map-element-visible');
        } else {
          const marker = L.marker([lblLat, lblLng], {
            icon: icon,
            interactive: false,
            zIndexOffset: zIndex
          });
          marker.addTo(map);
          activeLabelMarkers.set(labelId, marker);
          requestAnimationFrame(() => marker.getElement()?.classList.add('map-element-visible'));
        }
      }
    }

    // 5. Cleanup Missing Labels (Exit)
    for (const [id, marker] of activeLabelMarkers) {
      if (!validLabelIds.has(id)) {
        const el = marker.getElement();
        if (el) el.classList.remove('map-element-visible'); // Fade out
        activeLabelMarkers.delete(id);
        setTimeout(() => { if (map.hasLayer(marker)) map.removeLayer(marker); }, 400); // Remove after anim
      }
    }
  }
</script>

<div class="wrapper">
  <div class="map zoom-{Math.floor(zoom)}" bind:this={mapContainer}></div>
  <div class="compass">
    <div class="viewport-box" style="left: {viewportLeft}px; top: {viewportTop}px; width: {viewportWidth}px; height: {viewportHeight}px;"></div>
    <div class="yaxis"></div>
    <div class="compassLabel ylabel top">Short-term</div>
    <div class="compassLabel ylabel bottom">Long-term</div>
    <div class="xaxis"></div>
    <div class="compassLabel xlabel left">Less agency</div>
    <div class="compassLabel xlabel right">More agency</div>
  </div>
</div>

<style>
  /* --- LAYOUT --- */
  :global(body), :global(html) { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
  .wrapper { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #1e3d54; z-index: 1; }
  .map { width: 100%; height: 100%; background: #1e3d54; }

  /* --- COMPASS --- */
  .compass { position: absolute; left: 10px; bottom: 10px; width: 180px; height: 180px; background: rgba(255, 255, 255, 0.95); z-index: 999; border: 2px solid #333; border-radius: 4px; overflow: hidden; }
  .viewport-box { position: absolute; background: rgba(30, 61, 84, 0.25); pointer-events: none; z-index: 50; }
  .yaxis { position: absolute; left: 50%; top: 20px; border-left: 2px solid #666; height: calc(100% - 40px); z-index: 60; }
  .xaxis { position: absolute; top: 50%; left: 20px; border-top: 2px solid #666; width: calc(100% - 40px); z-index: 60; }
  .compassLabel { position: absolute; font-size: 10px; line-height: 11px; font-weight: 600; color: #333; z-index: 70; }
  .compassLabel.ylabel { width: 100%; text-align: center; }
  .compassLabel.xlabel { top: calc(50% - 10px); transform: translateY(-50%); text-align: center; }
  .compassLabel.top { top: 5px; } .compassLabel.bottom { bottom: 5px; }
  .compassLabel.left { left: 5px; text-align: left; } .compassLabel.right { right: 5px; text-align: right; }

  /* --- MAP ELEMENTS --- */

  /* TRANSITIONS: Only fade opacity, don't transition bounds/font-size */
  :global(.map-label),
  :global(.interactive-dot) {
    opacity: 0;
    transition: opacity 0.4s ease-in-out;
  }

  :global(.map-element-visible) {
    opacity: 1 !important;
  }

  :global(.interactive-dot) { cursor: pointer; transition: opacity 0.4s, r 0.2s; } /* Radius anim allowed */

  /* LABEL BASE */
  :global(.map-label) {
    background: transparent; border: none; text-align: center;
    white-space: nowrap !important; pointer-events: none;
    display: flex; justify-content: center; align-items: center; line-height: 1.2;
  }
  :global(.map-label span) { display: block; max-width: none !important; white-space: nowrap !important; }

  /* WRAPPED LABELS (HTML) */
  :global(.map-label.wrapped),
  :global(.map-label.wrapped span) {
    white-space: normal !important;
    text-align: center;
    line-height: 1.1;
  }
  :global(.label-l1.wrapped) { width: 100%; display: flex; justify-content: center; align-items: center; }

  /* L1 STYLES */
  :global(.label-l1 span) {
    font-family: var(--serif); font-weight: 800; color: #ffffff; text-transform: uppercase;
    letter-spacing: 0.3em;
    text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 4px 8px rgba(0, 0, 0, 0.9);
    transition: letter-spacing 0.3s;
  }
  :global(.zoom-2 .label-l1 span) { letter-spacing: 2px; }
  :global(.zoom-3 .label-l1 span) { letter-spacing: 5px; }
  :global(.zoom-4 .label-l1 span) { letter-spacing: 7px; }
  :global(.zoom-5 .label-l1 span) { letter-spacing: 10px; }
  :global(.zoom-6 .label-l1 span) { letter-spacing: 13px; }

  /* L2 STYLES */
  :global(.label-l2 span) {
    font-family: var(--serif); font-weight: 400; color: #ffe06e; text-transform: uppercase;
    letter-spacing: 1px;
    text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000, 0 2px 4px rgba(0, 0, 0, 0.9);
  }

  /* L3 STYLES */
  :global(.label-l3 span) {
    font-family: var(--sans); font-size: 10px; line-height: 10px; font-weight: 400;
    color: #ffffff; text-transform: none; letter-spacing: 0px;
    text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 1px 3px rgba(0, 0, 0, 1);
  }

  :global(.curved-label), :global(.curved-label svg) { overflow: visible !important; background: transparent !important; }
</style>
