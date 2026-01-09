<script>
  import { onMount } from "svelte";
  import "leaflet/dist/leaflet.css";

  let mapContainer;
  let map;
  let L;

  // STATE
  let allLabels = [];
  let allDots = [];
  let currentLabelLayer = null;
  let currentDotLayer = null;
  let zoom = 1; // Default zoom state

  // CACHE & SETTINGS
  const textWidthCache = new Map();
  let measureContext = null;
  let appFontFamily = "sans-serif";

  onMount(async () => {
    L = (await import("leaflet")).default;

    // 1. Resolve Font Family
    const computedStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--sans")
      .trim();
    if (computedStyle) appFontFamily = computedStyle;

    // 2. Initialize Canvas for text measurement
    const canvas = document.createElement("canvas");
    measureContext = canvas.getContext("2d");

    // 3. MAP CONFIGURATION (EXPANDED BOUNDS)
    // The Python script generates a 256x256 unit world at Zoom 0.
    const mapSize = 256;

    // Expand bounds to allow more panning room
    // Adding 50% padding on each side (you can adjust this value)
    const padding = mapSize * 0.5; // 128 units of padding

    // Original tile bounds
    const tileBounds = [
      [0, 0],
      [-mapSize, mapSize]
    ];

    // Expanded bounds for panning
    const expandedBounds = [
      [padding, -padding], // Top-left with padding
      [-mapSize - padding, mapSize + padding] // Bottom-right with padding
    ];

    map = L.map(mapContainer, {
      crs: L.CRS.Simple, // Coordinate system for flat images
      minZoom: 2, // Allow zooming all the way out
      maxZoom: 6,
      zoomControl: false,
      preferCanvas: true,
      center: [-128, 128], // Center of the 256x256 world
      zoom: 2, // Start zoomed in slightly to avoid edge visual glitches
      maxBounds: expandedBounds, // Use expanded bounds for panning
      maxBoundsViscosity: 0.8, // Slightly softer boundary (0.0 = no restriction, 1.0 = hard stop)
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 60
    });

    L.tileLayer("assets/tiles/{z}/{x}/{y}.png", {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 6,
      noWrap: true, // Don't repeat the world
      bounds: tileBounds, // Tiles still only exist in original bounds
      errorTileUrl: "" // Optional: path to a blank PNG if a tile is missing
    }).addTo(map);

    // Snap view to world (but allow panning beyond)
    map.fitBounds(tileBounds);

    // 4. Load Data & Interactions
    await loadData();

    let renderTimeout;
    map.on("moveend zoomend", () => {
      clearTimeout(renderTimeout);
      renderTimeout = setTimeout(renderViewport, 30);
    });

    document.fonts.ready.then(() => {
      renderViewport();
    });
  });

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
        fetch("/assets/labels.json"),
        fetch("/assets/interaction.json")
      ]);

      allLabels = await labelsRes.json();

      // Priority Sorting for Labels
      const TYPE_RANK = { l1: 1000, l2: 500, l3: 1 }; // Bigger gaps between types
      allLabels.forEach((l) => (l._random = Math.random()));

      allLabels.sort((a, b) => {
        const rankA = TYPE_RANK[a.type] || 0;
        const rankB = TYPE_RANK[b.type] || 0;

        // First sort by type (L1 > L2 > L3)
        if (rankA !== rankB) return rankB - rankA;

        // Then by priority within the same type
        if (b.priority !== a.priority) return b.priority - a.priority;

        // Finally by random for variety
        return b._random - a._random;
      });

      const rawDots = await dotsRes.json();
      allDots = shuffle(rawDots);
    } catch (err) {
      console.error("Error loading data:", err);
    }
  }

  // Helper to get font size based on zoom
  function getFontSize(type, currentZoom) {
    if (type === "l1") {
      // Sizes that match CSS exactly
      switch (Math.floor(currentZoom)) {
        case 2:
          return 11;
        case 3:
          return 14;
        case 4:
          return 16;
        case 5:
          return 18;
        case 6:
          return 22;
        default:
          return 11;
      }
    } else if (type === "l2") {
      // Sizes that match CSS exactly
      switch (Math.floor(currentZoom)) {
        case 2:
          return 9;
        case 3:
          return 10;
        case 4:
          return 11;
        case 5:
          return 12;
        case 6:
          return 13;
        default:
          return 9;
      }
    }
    return 10; // l3
  }

  function getPreciseWidth(text, type, currentZoom = 2) {
    const cacheKey = `${text}-${type}-${Math.floor(currentZoom)}`;
    if (textWidthCache.has(cacheKey)) return textWidthCache.get(cacheKey);

    const fontSize = getFontSize(type, currentZoom);

    if (type === "l1") {
      measureContext.font = `800 ${fontSize}px ${appFontFamily}`;
    } else if (type === "l2") {
      measureContext.font = `400 ${fontSize}px ${appFontFamily}`;
    } else {
      measureContext.font = `400 ${fontSize}px ${appFontFamily}`;
    }

    const width = measureContext.measureText(text).width;

    // Add letter-spacing to width calculation
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

  function createCurvedLabel(text, lat, lng, type, zoom) {
  // Create a unique ID for this path
  const pathId = `path-${lat}-${lng}`.replace(/\./g, "-");

  // Calculate font size and letter spacing
  const fontSize = getFontSize(type, zoom);
  const letterSpacing =
    zoom <= 2 ? 2 : zoom === 3 ? 5 : zoom === 4 ? 7 : zoom === 5 ? 10 : 13;

  // Calculate the actual text width with letter spacing
  const textLength = text.length;
  const estimatedCharWidth = fontSize * 0.7;
  const totalTextWidth = (textLength * estimatedCharWidth) + (textLength * letterSpacing);

  // Make the SVG wide enough to fit all text
  const svgWidth = Math.max(300, totalTextWidth * 1.5);
  const svgHeight = fontSize * 4;

  // Calculate radius for the arc
  const radius = Math.max(50, totalTextWidth * 0.4);

  // Create arc that's centered in the SVG
  const startX = svgWidth * 0.15;
  const endX = svgWidth * 0.85;
  const midX = svgWidth * 0.5;
  const midY = svgHeight/2 - (radius * 0.2); // Center vertically with slight curve up
  const baseY = svgHeight/2; // Base of the arc at vertical center

  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" style="position: absolute; pointer-events: none; overflow: visible;">
      <defs>
        <path id="${pathId}" d="M ${startX},${baseY} Q ${midX},${midY} ${endX},${baseY}" fill="none"/>
      </defs>
      <text style="
        font-family: var(--serif);
        font-size: ${fontSize}px;
        font-weight: 800;
        fill: #ffffff;
        text-transform: uppercase;
        letter-spacing: ${letterSpacing}px;
        text-shadow: 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 4px 8px rgba(0, 0, 0, 0.9);
      ">
        <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">
          ${text}
        </textPath>
      </text>
    </svg>
  `;

  return { html: svg, width: svgWidth, height: svgHeight };
}

  function renderViewport() {
    if (!map) return;

    zoom = map.getZoom();
    const bounds = map.getBounds();
    const paddedBounds = bounds.pad(0.1);
    const mapSize = map.getSize();
    const isMaxZoom = zoom >= 6;

    // --- A. RENDER DOTS ---
    if (currentDotLayer) map.removeLayer(currentDotLayer);

    if (zoom >= 3) {
      const newDotLayer = L.layerGroup();
      const currentRadius = Math.max(1, zoom / 2);
      const maxDots = isMaxZoom ? Infinity : 15000;
      let dotsRendered = 0;

      for (let i = 0; i < allDots.length; i++) {
        if (dotsRendered >= maxDots) break;
        const p = allDots[i];
        // Convert normalized coordinates (0.0-1.0) to Leaflet Simple coordinates
        const pLat = -(p[1] * 256);
        const pLng = p[0] * 256;

        if (
          pLat > bounds.getSouth() &&
          pLat < bounds.getNorth() &&
          pLng > bounds.getWest() &&
          pLng < bounds.getEast()
        ) {
          L.circleMarker([pLat, pLng], {
            radius: currentRadius,
            color: "#000000",
            weight: 0.5,
            fillColor: "#000000",
            // fillColor: p[6],
            fillOpacity: 0.3,
            className: "interactive-dot"
          })
            .bindPopup(`l1. ${p[4]}<br>l2. ${p[5]}<br>l3. ${p[2]}`)
            .addTo(newDotLayer);
          dotsRendered++;
        }
      }
      newDotLayer.addTo(map);
      currentDotLayer = newDotLayer;
    }

    // --- B. RENDER LABELS ---
    if (currentLabelLayer) map.removeLayer(currentLabelLayer);
    const newLabelLayer = L.layerGroup();

    // Define TYPE_RANK here so it's accessible
    const TYPE_RANK = { l1: 1000, l2: 500, l3: 1 };

    // Spatial Grid for Collision Detection
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

    // Define these OUTSIDE the loop - use getFontSize for consistency
    const hL1 = getFontSize("l1", zoom);
    const hL2 = getFontSize("l2", zoom);
    const hL3 = 10;
    const FORCE_SHOW_PRIORITY = 10;
    const densityBuffer = (3.5 - zoom) * 4;
    const MAX_LABEL_WIDTH = 200; // Increased for better single-line display

    for (const l of allLabels) {
      const isMandatory = l.priority >= FORCE_SHOW_PRIORITY;

      if (!isMandatory && !isMaxZoom) {
        if (l.type === "l2" && zoom < 0) continue;
        if (l.type === "l3" && zoom < 2) continue;
      }

      // Convert coords
      const lblLat = -(l.y * 256);
      const lblLng = l.x * 256;
      const latLng = L.latLng(lblLat, lblLng);

      if (!paddedBounds.contains(latLng)) continue;

      const pos = map.latLngToContainerPoint(latLng);
      const rawTxtWidth = getPreciseWidth(l.text, l.type, zoom);
      const baseLineHeight =
        l.type === "l1" ? hL1 : l.type === "l2" ? hL2 : hL3;

      // Around line 380, update this part:
      let calcWidth = rawTxtWidth;
      let calcHeight = baseLineHeight;

      // For L1 with curved labels, adjust the box size based on actual text
      if (l.type === "l1") {
        const fontSize = getFontSize(l.type, zoom);
        const letterSpacing =
          zoom <= 2 ? 2 : zoom === 3 ? 5 : zoom === 4 ? 7 : zoom === 5 ? 10 : 13;
        const textLength = l.text.length;
        const estimatedCharWidth = fontSize * 0.7;
        const totalTextWidth = (textLength * estimatedCharWidth) + (textLength * letterSpacing);

        calcWidth = Math.max(300, totalTextWidth * 1.5);
        calcHeight = fontSize * 4;
      } else if (rawTxtWidth > MAX_LABEL_WIDTH) {
        calcWidth = MAX_LABEL_WIDTH;
        const estimatedLines = Math.ceil(rawTxtWidth / MAX_LABEL_WIDTH);
        calcHeight = baseLineHeight * estimatedLines * 1.2;
      }

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

      if (isMandatory || isMaxZoom || !checkCollision(box)) {
        let icon;

        if (l.type === "l1") {
          // Use curved labels for L1
          const curved = createCurvedLabel(l.text, lblLat, lblLng, l.type, zoom);
          icon = L.divIcon({
            className: `map-label label-${l.type} curved-label`,
            html: curved.html,
            iconSize: [curved.width, curved.height],
            iconAnchor: [curved.width / 2, curved.height / 2] // Center the anchor
          });
        } else {
          // Keep straight labels for L2 and L3
          const fontSize = getFontSize(l.type, zoom);
          icon = L.divIcon({
            className: `map-label label-${l.type}`,
            html: `<span style="font-size: ${fontSize}px !important;">${l.text}</span>`,
            iconSize: [calcWidth + 20, calcHeight + 10],
            iconAnchor: [(calcWidth + 20) / 2, (calcHeight + 10) / 2]
          });
        }

        const marker = L.marker([lblLat, lblLng], {
          icon: icon,
          interactive: false,
          zIndexOffset: (TYPE_RANK[l.type] || 0) + l.priority * 10
        });
        newLabelLayer.addLayer(marker);
        addToGrid(box);
      }
    }

    newLabelLayer.addTo(map);
    currentLabelLayer = newLabelLayer;
  }
</script>

<div class="wrapper">
  <div class="map zoom-{Math.floor(zoom)}" bind:this={mapContainer}></div>
</div>


<style>
  /* Ensure the container actually fills the screen */
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
    background-color: #1e3d54; /* Match Ocean Color */
    z-index: 1;
  }

  .map {
    width: 100%;
    height: 100%;
    background: #1e3d54; /* Match Ocean Color */
  }

  /* LABEL STYLES */
  :global(.map-label) {
    background: transparent;
    border: none;
    text-align: center;
    white-space: nowrap !important; /* Force single line */
    pointer-events: none;
    display: flex;
    justify-content: center;
    align-items: center;
    line-height: 1.2;
  }

  :global(.map-label span) {
    display: block;
    max-width: none !important; /* No max width for single line */
    white-space: nowrap !important; /* Force single line */
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
    transition: all 0.3s;
  }

  /* Zoom-specific letter spacing for L1 */
  :global(.zoom-2 .label-l1 span) {
    letter-spacing: 2px;
  }

  :global(.zoom-3 .label-l1 span) {
    letter-spacing: 5px;
  }

  :global(.zoom-4 .label-l1 span) {
    letter-spacing: 7px;
  }

  :global(.zoom-5 .label-l1 span) {
    letter-spacing: 10px;
  }

  :global(.zoom-6 .label-l1 span) {
    letter-spacing: 13px;
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
    transition: all 0.3s;
  }

  :global(.label-l3 span) {
    font-family: var(--sans);
    font-size: 10px;
    line-height: 10px;
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

  :global(.interactive-dot) {
    cursor: pointer;
    transition: r 0.2s;
  }
  :global(.curved-label) {
  overflow: visible !important;
  background: transparent !important;
}

:global(.curved-label svg) {
  overflow: visible !important;
}
</style>
