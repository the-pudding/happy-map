<script>
  import { onMount } from "svelte";
  import "leaflet/dist/leaflet.css";
  import { fade } from "svelte/transition";
  import {
    convertCountries,
    getFontSize
  } from "$components/helpers/textUtils.js";
  import copy from "$data/copy.json";
  import Text from "$components/happy-map/Text.happymap.svelte";

  let mapContainer;
  let compassContainer;
  let map;
  let L;
  let introStage = $state(0);
  let introShown = $state(true);
  let infoShown = $state(false);
  let storyActiveIndex = $state(-1);
  // --- FILTER STATE ---
  let isFilterPanelOpen = $state(false);

  // INITIAL STATE: ALL TRUE (Everything visible by default)
  let filters = $state({
    location: { us: true, nonUs: true },
    age: {
      range1: true, // < 20
      range2: true, // 20-29
      range3: true, // 30-39
      range4: true, // 40-49
      range5: true, // 50-59
      range6: true, // 60-69
      range7: true // 70+
    },
    sex: { m: true, f: true, o: true },
    parent: { yes: true, no: true },
    marital: { single: true, married: true, divorced: true }
  });

  // Helper to toggle a whole group at once
  function toggleGroup(groupName, value) {
    const keys = Object.keys(filters[groupName]);
    keys.forEach((key) => {
      filters[groupName][key] = value;
    });
  }

  // --- MAP STATE ---
  let allLabels = [];
  let allDots = [];
  const activeLabelMarkers = new Map();
  const activeDotMarkers = new Map();
  const iconCache = new Map();

  let zoom = copy.story[introStage].zoom;
  let viewportLeft = $state(20);
  let viewportTop = $state(20);
  let viewportWidth = $state(140);
  let viewportHeight = $state(140);

  const textWidthCache = new Map();
  let measureContext = null;
  let appFontFamily = "sans-serif";

  // --- DEBUG STATE ---
  let clickX = $state(0);
  let clickY = $state(0);
  let normalizedX = $state(0);
  let normalizedY = $state(0);
  let zoomAmount = $state(zoom);
  let showDebug = true;

  // --- COMPASS LOGIC ---
  function updateCompassViewport() {
    if (!map || !compassContainer) return;
    const cw = compassContainer.offsetWidth;
    const padding = cw * (20 / 180);
    const compassInnerSize = cw - padding * 2;

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

    viewportLeft = Math.max(
      padding,
      Math.min(
        padding + compassInnerSize,
        leftPercent * compassInnerSize + padding
      )
    );
    const right = Math.max(
      padding,
      Math.min(
        padding + compassInnerSize,
        rightPercent * compassInnerSize + padding
      )
    );
    viewportWidth = Math.max(5, right - viewportLeft);

    const topPercent =
      (mapBounds[0][0] - north) / (mapBounds[0][0] - mapBounds[1][0]);
    const bottomPercent =
      (mapBounds[0][0] - south) / (mapBounds[0][0] - mapBounds[1][0]);

    viewportTop = Math.max(
      padding,
      Math.min(
        padding + compassInnerSize,
        topPercent * compassInnerSize + padding
      )
    );
    const bottom = Math.max(
      padding,
      Math.min(
        padding + compassInnerSize,
        bottomPercent * compassInnerSize + padding
      )
    );
    viewportHeight = Math.max(5, bottom - viewportTop);
  }

  onMount(async () => {
    L = (await import("leaflet")).default;

    const computedStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--sans")
      .trim();
    if (computedStyle) appFontFamily = computedStyle;

    const canvas = document.createElement("canvas");
    measureContext = canvas.getContext("2d");

    const mapSize = 256;
    const padding = mapSize * 0.5;
    const tileBounds = [
      [0, 0],
      [-mapSize, mapSize]
    ];
    const expandedBounds = [
      [padding, -padding],
      [-mapSize - padding, mapSize + padding]
    ];

    const w = window.innerWidth;
    const initialZoom = w < 500 ? 0 : w < 900 ? 1 : 2;
    zoom = initialZoom;
    const startData = copy.story[introStage];
    // const startLat = -(Number(startData.lat) * 256);
    // const startLng = Number(startData.lng) * 256;
    const startLat = -(Number(0.5) * 256);
    const startLng = Number(0.5) * 256;
    map = L.map(mapContainer, {
      crs: L.CRS.Simple,
      minZoom: 0,
      maxZoom: 6,
      zoomControl: false,
      preferCanvas: true,
      center: [startLat, startLng],
      zoom: initialZoom,
      maxBounds: expandedBounds,
      maxBoundsViscosity: 0.8,
      wheelDebounceTime: 10,
      wheelPxPerZoomLevel: 90
    });

    L.control
      .zoom({
        position: "topright"
      })
      .addTo(map);

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

    L.tileLayer("assets/tiles/{z}/{x}/{y}.png", {
      tileSize: 256,
      minZoom: 0,
      maxZoom: 6,
      noWrap: true,
      bounds: tileBounds,
      errorTileUrl: ""
    }).addTo(map);

    map.on("click", function (e) {
      const containerPoint = e.containerPoint;
      clickX = Math.round(containerPoint.x);
      clickY = Math.round(containerPoint.y);
      const latlng = e.latlng;
      normalizedX = Math.max(0, Math.min(1, latlng.lng / 256));
      normalizedY = Math.max(0, Math.min(1, -latlng.lat / 256));
      zoomAmount = map.getZoom();
    });

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
      if (closestMarker) closestMarker.openPopup();
    });

    await loadData();

    map.on("moveend zoomend", triggerRender);
    map.on("move zoom", updateCompassViewport);
    map.on("popupopen", triggerRender);
    map.on("popupclose", triggerRender);
    document.fonts.ready.then(triggerRender);
  });

  // --- RENDER TRIGGER ---
  let renderTimeout;
  const triggerRender = () => {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      renderViewport();
      updateCompassViewport();
    }, 30);
  };

  // --- FILTER EFFECT ---
  // When filters change, re-run render
  $effect(() => {
    const _ = JSON.stringify(filters); // Track deep changes
    triggerRender();
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
        fetch("assets/labels_cleaned.json"),
        fetch("assets/interaction.json")
      ]);

      allLabels = await labelsRes.json();
      const TYPE_RANK = { l1: 1000, l2: 500, l3: 1 };
      allLabels.forEach((l, index) => {
        l._random = Math.random();
        l._uniqueId = `lbl_${index}`;
      });
      allLabels.sort((a, b) => {
        const rankA = TYPE_RANK[a.type] || 0;
        const rankB = TYPE_RANK[b.type] || 0;
        if (rankA !== rankB) return rankB - rankA;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b._random - a._random;
      });

      const rawDots = await dotsRes.json();
      rawDots.forEach((d, i) => {
        d._stableId = i;
      });
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

  // --- FILTER CHECKER ---
  function matchesFilters(p) {
    // p[3] = Age, p[4] = Country, p[5] = Sex, p[6] = Marital, p[7] = Parent

    // 1. Location
    const isUS = p[4] === "USA";
    // If United States is checked (true), we show US. If unchecked (false) and it is US, we hide.
    if (isUS && !filters.location.us) return false;
    if (!isUS && !filters.location.nonUs) return false;

    // 2. Age
    // 2. Age
    const age = p[3];

    // Optional: Safety check to ensure age is actually a number
    if (isNaN(age)) return false;

    if (age < 20) {
      if (!filters.age.range1) return false;
    } else if (age >= 20 && age < 30) {
      if (!filters.age.range2) return false;
    } else if (age >= 30 && age < 40) {
      if (!filters.age.range3) return false;
    } else if (age >= 40 && age < 50) {
      if (!filters.age.range4) return false;
    } else if (age >= 50 && age < 60) {
      if (!filters.age.range5) return false;
    } else if (age >= 60 && age < 70) {
      if (!filters.age.range6) return false;
    } else if (age >= 70 && age < 100) {
      // This captures 70 to 99
      if (!filters.age.range7) return false;
    } else {
      // This catches Age 100+, effectively removing miscoded data
      return false;
    }
    // 3. Sex
    const sex = p[5];
    if (sex === "m") {
      if (!filters.sex.m) return false;
    } else if (sex === "f") {
      if (!filters.sex.f) return false;
    } else {
      if (!filters.sex.o) return false;
    }

    // 4. Parent
    const isParent = p[7] === "y";
    if (isParent && !filters.parent.yes) return false;
    if (!isParent && !filters.parent.no) return false;

    // 5. Marital
    const marital = p[6].toLowerCase();
    if (marital.includes("single")) {
      if (!filters.marital.single) return false;
    } else if (marital.includes("married")) {
      if (!filters.marital.married) return false;
    } else if (marital.includes("divorced")) {
      if (!filters.marital.divorced) return false;
    }

    return true;
  }

  function getPreciseWidth(text, type, currentZoom = 2) {
    const cacheKey = `${text}-${type}-${Math.floor(currentZoom)}`;
    if (textWidthCache.has(cacheKey)) return textWidthCache.get(cacheKey);
    const fontSize = getFontSize(type, currentZoom);
    if (type === "l1")
      measureContext.font = `800 ${fontSize}px ${appFontFamily}`;
    else measureContext.font = `400 ${fontSize}px ${appFontFamily}`;
    const width = measureContext.measureText(text).width;
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

  function renderViewport() {
    if (!map) return;
    zoom = map.getZoom();
    const currentZoomInt = Math.floor(zoom);
    const bounds = map.getBounds();
    const paddedBounds = bounds.pad(0.1);

    // --- A. DOTS RENDERING ---
    const visibleDotIndices = new Set();

    // 1. CHECK STORY STATE
    const currentStory = introShown ? copy.story[introStage] : null;
    const isIsolate = currentStory?.isolate == 1;

    // 2. ALWAYS ADD THE ACTIVE STORY DOT (If it exists)
    if (storyActiveIndex !== -1) {
      visibleDotIndices.add(storyActiveIndex);
    }

    // 3. ADD BACKGROUND DOTS (Only if NOT in isolate mode)
    if (!isIsolate && zoom >= 0) {
      const maxDots = Math.min(2000, zoom * 400);
      let dotsCount = 0;

      for (let i = 0; i < allDots.length; i++) {
        // Skip the active dot (already added)
        if (i === storyActiveIndex) continue;

        if (dotsCount >= maxDots) break;
        const p = allDots[i];

        // FILTER CHECK
        if (!matchesFilters(p)) continue;

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

    // ... (Rest of function: Icon caching, rendering markers, cleaning up markers, Labels) ...
    // Note: The code below this point in your original function remains exactly the same.
    const currentSize = Math.max(30, Math.floor(zoom * 8));

    function getCachedIcon(baseName, isActive) {
      // ... existing getCachedIcon logic ...
      const stateSuffix = isActive ? "-active" : "-default";
      const cacheKey = `${baseName}${stateSuffix}-${currentSize}`;
      if (iconCache.has(cacheKey)) return iconCache.get(cacheKey);
      const icon = L.icon({
        iconUrl: `assets/icons/${baseName}${stateSuffix}.png`,
        iconSize: [currentSize * 0.5333333333, currentSize],
        iconAnchor: [(currentSize * 0.5333333333) / 2, currentSize / 2],
        popupAnchor: [0, (-currentSize * 0.5333333333) / 2],
        className: "interactive-dot"
      });
      iconCache.set(cacheKey, icon);
      return icon;
    }

    for (const index of visibleDotIndices) {
      // ... existing rendering loop ...
      const p = allDots[index];
      const age = p[3];
      const sexChar = p[5];
      let ageGroup = "young";
      if (age > 60) ageGroup = "older";
      else if (age > 40) ageGroup = "old";
      else if (age > 25) ageGroup = "mid";
      const sex = sexChar === "m" ? "male" : "female";
      const variant = index % 6;
      const iconBaseName = `${ageGroup}-${sex}-${variant}`;

      if (activeDotMarkers.has(index)) {
        const marker = activeDotMarkers.get(index);
        const isActive = marker.isPopupOpen();
        const icon = getCachedIcon(iconBaseName, isActive);
        marker.setIcon(icon);
        marker.setZIndexOffset(isActive ? 1000 : 10);
        marker.getElement()?.classList.add("map-element-visible");
      } else {
        const icon = getCachedIcon(iconBaseName, false);
        const marker = L.marker([-(p[1] * 256), p[0] * 256], {
          icon: icon,
          zIndexOffset: 10
        }).bindPopup(cleanPopup(p));
        marker.addTo(map);
        activeDotMarkers.set(index, marker);
        requestAnimationFrame(() =>
          marker.getElement()?.classList.add("map-element-visible")
        );
      }
    }

    // CLEANUP: This automatically hides dots not in visibleDotIndices
    for (const [index, marker] of activeDotMarkers) {
      if (!visibleDotIndices.has(index)) {
        const el = marker.getElement();
        if (el) el.classList.remove("map-element-visible");
        activeDotMarkers.delete(index);
        setTimeout(() => {
          if (map.hasLayer(marker)) map.removeLayer(marker);
        }, 400);
      }
    }

    // ... Labels rendering continues here ...
    // --- B. LABELS RENDERING ---
    let labelsToConsider = allLabels.filter((l) => {
      // ...
      if (l.type === "l1") return currentZoomInt < 5;
      if (l.type === "l2") return currentZoomInt >= 3;
      if (l.type === "l3") return currentZoomInt >= 4;
      return false;
    });
    // ... (rest of label code) ...
    // ...
    labelsToConsider.sort((a, b) => {
      const typeRank = { l3: 3, l2: 2, l1: 1 };
      if (typeRank[a.type] !== typeRank[b.type])
        return typeRank[a.type] - typeRank[b.type];
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b._random - a._random;
    });

    const hL1 = getFontSize("l1", zoom);
    const hL2 = getFontSize("l2", zoom);
    const hL3 = 10;
    const validLabelIds = new Set();

    for (const l of labelsToConsider) {
      const lblLat = -(l.y * 256);
      const lblLng = l.x * 256;
      const latLng = L.latLng(lblLat, lblLng);
      if (!paddedBounds.contains(latLng)) continue;

      const baseLineHeight =
        l.type === "l1" ? hL1 : l.type === "l2" ? hL2 : hL3;
      const lines = l.text.split("\n");
      let maxLineWidth = 0;
      lines.forEach((lineText) => {
        const w = getPreciseWidth(lineText, l.type, zoom);
        if (w > maxLineWidth) maxLineWidth = w;
      });

      const calcWidth = maxLineWidth + 10;
      const calcHeight = baseLineHeight * lines.length * 1.2;
      const labelId = l._uniqueId;
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
        (l.type === "l3" ? 1000 : l.type === "l2" ? 500 : 1) + l.priority * 10;

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

  // function cleanPopup(p) {
  //   const info = `${Math.round(p[3])} / ${p[5].toUpperCase()} / ${convertCountries(p[4])}<br><span>${p[6].charAt(0).toUpperCase() + p[6].slice(1)} / ${p[7] == "y" ? "Parent" : "Not a parent"}</span>`;
  //   return "<div class='info'>" + info + "</div><div class='quote'>" + p[2] + "</div>";
  // }
  function cleanPopup(p) {
    // Standard info
    const info = `${Math.round(p[3])} / ${p[5].toUpperCase()} / ${convertCountries(p[4])}<br><span>${p[6].charAt(0).toUpperCase() + p[6].slice(1)} / ${p[7] == "y" ? "Parent" : "Not a parent"}</span>`;

    // NEW: Display the ID if it exists (for debugging/authoring)
    const idLabel =
      p._stableId !== undefined
        ? `<br><span style="font-size: 9px; color: #88a; letter-spacing: 0.5px; display: block; margin-top: 2px;">ID: ${p._stableId}</span>`
        : "";

    return (
      "<div class='info'>" +
      info +
      idLabel +
      "</div><div class='quote'>" +
      p[2] +
      "</div>"
    );
  }

  function stepToggle(t) {
    if (t == 2) {
      introShown = false;
      storyActiveIndex = -1; // Clear the story point
      map.closePopup();
      return;
    }
    introStage += t;

    const stageData = copy.story[introStage];

    // FIND THE DOT IN THE SHUFFLED ARRAY
    if (stageData.targetId !== undefined) {
      storyActiveIndex = allDots.findIndex(
        (d) => d._stableId === Number(stageData.targetId)
      );
    } else {
      storyActiveIndex = -1;
    }

    if (introStage == 0) {
      // --- FIX START: Define w and handle reset ---
      const w = window.innerWidth; // Get width dynamically
      const initialZoom = w < 500 ? 0 : w < 900 ? 1 : 2;
      zoom = initialZoom;

      // Reset position to the initial center (matching your onMount logic)
      const startLat = -(Number(0.5) * 256);
      const startLng = Number(0.5) * 256;
      map.flyTo([startLat, startLng], initialZoom);
      // --- FIX END ---
    } else {
      // Calculate position for other stages
      const targetLat = -(Number(stageData.lat) * 256);
      const targetLng = Number(stageData.lng) * 256;
      const latlng = L.latLng([targetLat, targetLng]);

      // Fly to location
      map.flyTo(latlng, stageData.zoom);
    }

    // Open Popup after move
    map.once("moveend", () => {
      // Ensure we haven't moved to another stage while animating
      if (storyActiveIndex !== -1) {
        // Trigger render to ensure the marker DOM element exists
        renderViewport();

        // Find the marker and open it
        const marker = activeDotMarkers.get(storyActiveIndex);
        if (marker) {
          marker.openPopup();
        }
      } else {
        map.closePopup();
      }
    });
  }
  function infoToggle(x) {
    infoShown = x;
    if (x) isFilterPanelOpen = false; // Close filters if opening info
  }
  function filterToggle() {
    isFilterPanelOpen = !isFilterPanelOpen;
    if (isFilterPanelOpen) infoShown = false; // Close info if opening filters
  }
</script>

<div class="wrapper">
  <div class="map zoom-{Math.floor(zoom)}" bind:this={mapContainer}></div>
  {#if !introShown}
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

<!-- FILTER BUTTON (Opens Panel) -->
{#if !introShown}
  <!-- FILTER BUTTON -->
  <button class="filterButton" onclick={filterToggle} transition:fade>
    Filter Responses
  </button>

  <!-- FILTER PANEL -->
  <div class="filterPanel {isFilterPanelOpen ? 'open' : ''}">
    <button class="close-panel-btn" onclick={filterToggle}>×</button>
    <h4>Filter Responses</h4>

    <!-- (Your Filter Groups go here...) -->
    <div class="filter-group">
      <div class="group-header">
        <div class="group-title">Location</div>
        <div class="group-actions">
          <button onclick={() => toggleGroup("location", true)}>All</button>
          <button onclick={() => toggleGroup("location", false)}>None</button>
        </div>
      </div>
      <label
        ><input type="checkbox" bind:checked={filters.location.us} /> U.S.</label
      >
      <label
        ><input type="checkbox" bind:checked={filters.location.nonUs} /> Non-U.S.</label
      >
    </div>
    <!-- ... include other filter groups ... -->
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

  <!-- INFO BUTTON -->
  <button id="showinfo" onclick={() => infoToggle(!infoShown)} transition:fade>
    Show info
  </button>

  <!-- INFO PANEL (Now always in DOM, class toggles visibility) -->
  <div class="infoPanel {infoShown ? 'open' : ''}">
    <button class="close-panel-btn" onclick={() => infoToggle(false)}>×</button>

    <h1>happy map</h1>
    <div class="byline">
      by <a href="https://pudding.cool/author/alvin-chang/" target="_blank"
        >alvin chang</a
      >
    </div>

    <div class="info-content">
      <Text copy={copy.info} />
    </div>
  </div>
{/if}
{#if showDebug}
  <textarea class="debug-panel">
    lng: {normalizedX.toFixed(4)}
    lat: {normalizedY.toFixed(4)}
    zoom: {zoomAmount}
  </textarea>
{/if}

{#if introShown}
  <!-- <div class="backgroundIntro" transition:fade>></div> -->
  <div class="introText" transition:fade>
    <Text copy={copy.story[introStage].text} />
    <!-- <div class="compass">
    <div class="yaxis"></div>
    <div class="compassLabel ylabel top">Immediate</div>
    <div class="compassLabel ylabel bottom">Long-term</div>
    <div class="xaxis"></div>
    <div class="compassLabel xlabel left">Less agency</div>
    <div class="compassLabel xlabel right">More agency</div>
  </div> -->
    <div class="buttonContainer">
      {#if introStage > 0}
        <button class="prev" onclick={() => stepToggle(-1)}>Back</button>
      {/if}
      {#if introStage < copy.story.length - 1}
        <button class="next" onclick={() => stepToggle(1)}>Next</button>
      {:else}
        <button class="explore next" onclick={() => stepToggle(2)}>Explore</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /*   .backgroundIntro {
    position: absolute;
    z-index: 99;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: grayscale(60%);
  } */

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

  .map {
    width: 100%;
    height: 100vh;
    background-color: #003a4a;
  }

  :global(.water-tile) {
    width: 256px;
    height: 256px;
    background-image: url("data:image/svg+xml,%3Csvg width='64' height='32' viewBox='0 0 64 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 16 Q16 28 32 16 T64 16' fill='none' stroke='%2319566e' stroke-width='1.5' opacity='0.3'/%3E%3C/svg%3E");
    background-size: 64px 32px;
    background-repeat: repeat;
  }

  /* COMPASS */
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

  /* ELEMENTS */
  :global(.map-label),
  :global(.interactive-dot) {
    opacity: 1;
  }
  :global(.map-element-visible) {
    opacity: 1 !important;
  }
  :global(.interactive-dot) {
    cursor: pointer;
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

  /* FILTERS UI */
  .filterButton {
    position: absolute;
    right: 10px;
    top: 10px;
    background: #002436;
    border: 1px solid #264a5c;
    color: white;
    padding: 8px 12px;
    cursor: pointer;
    text-shadow: 1px 1px 0 #000;
    font-family: var(--sans);
    z-index: 9;
    border-radius: 4px;
    font-size: 15px;
  }
  #showinfo {
    position: absolute;
    right: 10px;
    top: 50px;
    background: #002436;
    border: 1px solid #264a5c;
    color: white;
    padding: 8px 12px;
    cursor: pointer;
    text-shadow: 1px 1px 0 #000;
    font-family: var(--sans);
    z-index: 9;
    border-radius: 4px;
    font-size: 15px;
  }
  /* .filterButton:hover { background: #0c384a; } */

  .filterPanel {
    font-family: var(--sans);
    position: absolute;
    right: 0px;
    top: 0px;
    width: 240px;
    height: 100vh;
    background: #001126;
    color: white;
    padding: 60px 15px 15px 15px;
    z-index: 99999;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    box-shadow: -5px 0 15px rgba(0, 0, 0, 0.5);
    overflow-y: auto;
    border-left: 1px solid #264a5c;
  }
  .filterPanel.open {
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
    user-select: none; /* Prevents text selection when clicking fast */
  }
  .filterPanel label:hover {
    color: white;
  }

  /* --- CUSTOM CHECKBOX STYLING --- */
  .filterPanel input[type="checkbox"] {
    /* 1. Reset native appearance */
    -webkit-appearance: none;
    appearance: none;
    margin: 0;

    /* 2. Box Styling */
    width: 18px;
    height: 18px;
    border: 1px solid #5aa6cf; /* Visible blue border */
    border-radius: 3px;
    background-color: rgba(0, 36, 54, 0.5); /* Dark semi-transparent bg */

    /* 3. Layout for the checkmark */
    display: grid;
    place-content: center;
    cursor: pointer;
    flex-shrink: 0; /* Prevents squishing */
    transition: all 0.2s ease-in-out;
  }

  /* Hover state for the box */
  .filterPanel input[type="checkbox"]:hover {
    border-color: #9effdc;
    background-color: rgba(158, 255, 220, 0.1);
  }

  /* The checkmark (hidden by default) */
  .filterPanel input[type="checkbox"]::before {
    content: "";
    width: 10px;
    height: 10px;
    transform: scale(0); /* Hidden */
    transition: 0.1s transform ease-in-out;
    box-shadow: inset 1em 1em #001126; /* The color of the checkmark itself (dark blue) */
    background-color: #001126;
    transform-origin: center;
    /* Create the check shape */
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
  }

  /* CHECKED STATE */
  .filterPanel input[type="checkbox"]:checked {
    background-color: #9effdc; /* Bright green background */
    border-color: #9effdc;
  }

  .filterPanel input[type="checkbox"]:checked::before {
    transform: scale(1); /* Show checkmark */
  }

  /* INFO PANEL STYLES */
  .infoPanel {
    font-family: var(--sans);
    position: absolute;
    right: 0px;
    top: 0px;
    width: 350px; /* Slightly wider than filter panel for reading */
    max-width: 100%;
    height: 100vh;
    background: #001126;
    color: white;
    padding: 60px 25px 25px 25px; /* Top padding clears the buttons */
    z-index: 99999;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    box-shadow: -5px 0 15px rgba(0, 0, 0, 0.5);
    overflow-y: auto;
    border-left: 1px solid #264a5c;
  }
  .infoPanel.open {
    transform: translateX(0);
  }

  /* Static Compass Legend inside Info Panel */
  .legend-container {
    margin: 20px 0;
    height: 140px;
    position: relative;
    border: 1px solid #1e3d54;
    border-radius: 4px;
    background: #001829;
  }
  .static-compass {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 120px;
    height: 120px;
    border: 1px solid #264a5c;
    background: #002436;
    border-radius: 50%; /* Make it circular for the legend? Or keep boxy? matching map for now */
    border-radius: 4px;
  }
  /* Reuse compass label styles but adjust slightly for static context if needed */
  .static-compass .compassLabel {
    font-size: 10px;
  }

  /* Close X button inside panel */
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
  .close-panel-btn:hover {
    color: white;
  }
</style>
