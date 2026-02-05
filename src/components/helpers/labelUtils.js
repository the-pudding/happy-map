import { TextLayer } from "@deck.gl/layers";
import { getLabelSize } from "$components/helpers/textUtils.js";

const handwriting = '"Playpen Sans", cursive';
const fontSizeMultiplier = 1.15;
export function filterLabels(allLabels, zoom) {
  const currentZoomInt = Math.floor(zoom);
  return allLabels.filter((l) => {
    if (l.type === "l1") return currentZoomInt < 4;
    if (l.type === "l2") return currentZoomInt >= 3;
    if (l.type === "l3") return currentZoomInt >= 4;
    return false;
  });
}
// Ensure you export or include filterLabels if it's in the same file
export function createLabelLayers(allLabels, zoom, fontLoaded) {
  // 1. Filter labels based on zoom
  const labelsToRender = filterLabels(allLabels, zoom);

  // --- HELPER CONFIGURATIONS ---

// GLOW SETTINGS - THICKER SHADOWS
const glowSettings = {
  fontSettings: {
    sdf: true,
    fontSize: 128,
    buffer: 100,      // Increased from 32 - prevents clipping of larger glow
    radius: 60,      // Increased from 24 - larger blur radius
    smoothing: 0.5   // Increased from 0.4 - softer/more diffuse glow
  },
  outlineWidth: 80,  // Increased from 25 - main thickness control
  outlineColor: [0, 0, 0, 255],
  getColor: [0, 0, 0, 0]
};

// TEXT SETTINGS - THICKER OUTLINE
const textSettings = {
  fontSettings: {
    sdf: true,
    fontSize: 128,
    buffer: 12,      // Increased from 8
    radius: 12,      // Increased from 8
    smoothing: 0.1
  },
  outlineWidth: 4,   // Increased from 2 - thicker crisp outline
  outlineColor: [0, 0, 0, 255]
};

  // --- LAYER CREATION ---

  // LAYER 1: Unified Glow
  const allLabelsGlow = new TextLayer({
    id: "labels-all-glow",
    data: labelsToRender,
    getPosition: (d) => [d.x * 256, d.y * 256],
    getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
    getSize: (d) => getLabelSize(d.type, zoom) * fontSizeMultiplier,
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",

    // --- FIX 1: Complete the Ternary Operator ---
    fontFamily: fontLoaded ? handwriting  : 'sans-serif',

    // --- FIX 2: Use 400 (Patrick Hand SC has no 600 weight) ---
    fontWeight: "400",

    billboard: true,
    ...glowSettings,
    updateTriggers: {
      getSize: [zoom],
      getFontFamily: [fontLoaded] // Ensure this is here
    }
  });

  // LAYER 2: Unified Main Text
  const allLabelsText = new TextLayer({
    id: "labels-all-main",
    data: labelsToRender,
    getPosition: (d) => [d.x * 256, d.y * 256],
    getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
    getSize: (d) => getLabelSize(d.type, zoom) * fontSizeMultiplier,
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",

    // --- FIX 1: Complete the Ternary Operator ---
    fontFamily: fontLoaded ? handwriting : 'sans-serif',

    // --- FIX 2: Use 400 ---
    fontWeight: "400",

    billboard: true,
    ...textSettings,

    getColor: (d) => {
      if (d.type === "l1") return [255, 255, 255, 255];
      if (d.type === "l2") return [255, 224, 110, 255];
      return [255, 255, 255, 255];
    },

    updateTriggers: {
      getSize: [zoom],
      getFontFamily: [fontLoaded] // Ensure this is here
    }
  });

  return [allLabelsGlow, allLabelsText];
}

export function spreadDotsToGrid(dots, cellSize = 0.005, spreadFactor = 0.7) {
  const grid = new Map();
  return dots.map((dot) => {
    const cellX = Math.floor(dot[0] / cellSize);
    const cellY = Math.floor(dot[1] / cellSize);
    const key = `${cellX},${cellY}`;
    const count = grid.get(key) || 0;
    grid.set(key, count + 1);
    if (count === 0) return dot;
    const angle = count * 2.4;
    const dist = cellSize * spreadFactor * Math.sqrt(count);
    const adjusted = [...dot];
    adjusted[0] = dot[0] + Math.cos(angle) * dist;
    adjusted[1] = dot[1] + Math.sin(angle) * dist;
    adjusted._stableId = dot._stableId;
    adjusted._isActive = dot._isActive;
    return adjusted;
  });
}
