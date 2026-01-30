import { TextLayer } from "@deck.gl/layers";
import { getLabelSize } from "$components/helpers/textUtils.js";

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

  // GLOW SETTINGS
  const glowSettings = {
    fontSettings: {
      sdf: true,
      fontSize: 128,
      buffer: 32,
      radius: 24,
      smoothing: 0.4
    },
    outlineWidth: 16,
    outlineColor: [0, 0, 0, 255],
    getColor: [0, 0, 0, 0]
  };

  // TEXT SETTINGS
  const textSettings = {
    fontSettings: {
      sdf: true,
      fontSize: 128,
      buffer: 8,
      radius: 8,
      smoothing: 0.1
    },
    outlineWidth: 2,
    outlineColor: [0, 0, 0, 255]
  };

  // --- LAYER CREATION ---

  // LAYER 1: Unified Glow
  const allLabelsGlow = new TextLayer({
    id: "labels-all-glow",
    data: labelsToRender,
    getPosition: (d) => [d.x * 256, d.y * 256],
    getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
    getSize: (d) => getLabelSize(d.type, zoom) * 1.4,
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",

    // --- FIX 1: Complete the Ternary Operator ---
    fontFamily: fontLoaded ? '"Patrick Hand SC", cursive' : 'sans-serif',

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
    getSize: (d) => getLabelSize(d.type, zoom) * 1.4,
    getTextAnchor: "middle",
    getAlignmentBaseline: "center",

    // --- FIX 1: Complete the Ternary Operator ---
    fontFamily: fontLoaded ? '"Patrick Hand SC", cursive' : 'sans-serif',

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
// export function createLabelLayers(allLabels, zoom) {
//   const labelsToRender = filterLabels(allLabels, zoom);
//   const serifLabels = labelsToRender.filter((d) => d.type !== "l3");
//   const sansLabels = labelsToRender.filter((d) => d.type === "l3");

//   // --- HELPER CONFIGURATIONS ---

//   // 1. GLOW SETTINGS (The blurry background layer)
//   const glowSettings = {
//     fontSettings: {
//       sdf: true,
//       fontSize: 128,
//       buffer: 32,      // Huge buffer prevents the glow from being clipped
//       radius: 24,      // Large radius prevents "broken" artifact lines
//       smoothing: 0.4  // High smoothing creates the BLUR effect
//     },
//     outlineWidth: 16,             // Thickness of the glow
//     outlineColor: [0, 0, 0, 255], // Dark semi-transparent shadow
//     getColor: [0, 0, 0, 0]        // Text fill is invisible (alpha 0)
//   };

//   // 2. TEXT SETTINGS (The crisp foreground layer)
//   const textSettings = {
//     fontSettings: {
//       sdf: true,
//       fontSize: 128,
//       buffer: 8,
//       radius: 8,
//       smoothing: 0.1   // Low smoothing keeps text sharp
//     },
//     outlineWidth: 2,              // Thin crisp outline for immediate contrast
//     outlineColor: [0, 0, 0, 255], // Opaque black
//     // Note: getColor is defined per-layer below
//   };

//   // --- LAYER CREATION ---

//   // LAYER 1: The Glows (Must render FIRST to appear BEHIND)
//   const serifGlow = new TextLayer({
//     id: "labels-serif-glow",
//     data: serifLabels,
//     getPosition: (d) => [d.x * 256, d.y * 256],
//     getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
//     getSize: (d) => getLabelSize(d.type, zoom),
//     getTextAnchor: "middle",
//     getAlignmentBaseline: "center",
//     fontFamily: '"Playfair Display", serif',
//     fontWeight: "800",
//     billboard: true,
//     ...glowSettings,
//     updateTriggers: { getSize: [zoom] }
//   });

//   const sansGlow = new TextLayer({
//     id: "labels-sans-glow",
//     data: sansLabels,
//     getPosition: (d) => [d.x * 256, d.y * 256],
//     getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
//     getSize: (d) => getLabelSize(d.type, zoom),
//     getTextAnchor: "middle",
//     getAlignmentBaseline: "center",
//     fontFamily: '"Atlas Grotesk", sans-serif',
//     fontWeight: "400",
//     billboard: true,
//     ...glowSettings,
//     updateTriggers: { getSize: [zoom] }
//   });

//   // LAYER 2: The Crisp Text (Renders ON TOP)
//   const serifText = new TextLayer({
//     id: "labels-serif-main",
//     data: serifLabels,
//     getPosition: (d) => [d.x * 256, d.y * 256],
//     getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
//     getSize: (d) => getLabelSize(d.type, zoom),
//     getTextAnchor: "middle",
//     getAlignmentBaseline: "center",
//     fontFamily: '"Playfair Display", serif',
//     fontWeight: "800",
//     billboard: true,
//     ...textSettings,
//     getColor: (d) => {
//       if (d.type === "l1") return [255, 255, 255, 255];
//       if (d.type === "l2") return [255, 224, 110, 255];
//       return [255, 255, 255, 255];
//     },
//     updateTriggers: { getSize: [zoom] }
//   });

//   const sansText = new TextLayer({
//     id: "labels-sans-main",
//     data: sansLabels,
//     getPosition: (d) => [d.x * 256, d.y * 256],
//     getText: (d) => d.text.replace(/<br\s*\/?>/gi, "\n"),
//     getSize: (d) => getLabelSize(d.type, zoom),
//     getTextAnchor: "middle",
//     getAlignmentBaseline: "center",
//     fontFamily: '"Atlas Grotesk", sans-serif',
//     fontWeight: "400",
//     billboard: true,
//     ...textSettings,
//     getColor: [255, 255, 255, 255],
//     updateTriggers: { getSize: [zoom] }
//   });

//   // Return all 4 layers
//   return [serifGlow, sansGlow, serifText, sansText];
// }

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
