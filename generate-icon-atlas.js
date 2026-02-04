/**
 * Icon Atlas Generator for Happy Map
 *
 * Generates atlas for: {ageGroup}-{sex}-{variant}
 * - Age groups: young, mid, old, older
 * - Sex: male, female
 * - Variants: 0-17
 * = 144 total icons
 *
 * Usage: node generate-icon-atlas.js
 * Requirements: npm install sharp
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  iconsDir: 'static/assets/icons',
  atlasOutput: 'static/assets/icon-atlas.png',
  mappingOutput: 'src/data/icon-mapping.json',

  // Your icon dimensions
  iconWidth: 120,
  iconHeight: 225,

  // Padding between icons (prevents texture bleeding)
  padding: 2,

  // 144 icons at 122x227 each (with padding)
  // 12 cols × 12 rows = 144 icons exactly
  // 12 × 122 = 1464 width, 12 × 227 = 2724 height
  // Round up to power of 2 for GPU efficiency
  atlasWidth: 2048,
  atlasHeight: 4096,
};

// Your icon naming scheme
const AGE_GROUPS = ['young', 'mid', 'old', 'older'];
const SEXES = ['male', 'female'];
const VARIANTS = 18; // 0-17

// =============================================================================
// GENERATE ALL ICON NAMES
// =============================================================================

function getAllIconNames() {
  const names = [];
  for (const age of AGE_GROUPS) {
    for (const sex of SEXES) {
      for (let v = 0; v < VARIANTS; v++) {
        names.push(`${age}-${sex}-${v}`);
      }
    }
  }
  return names;
}

// =============================================================================
// ATLAS GENERATION
// =============================================================================

async function generateAtlas() {
  const { iconsDir, atlasOutput, mappingOutput, iconWidth, iconHeight, padding, atlasWidth, atlasHeight } = CONFIG;

  const iconNames = getAllIconNames();
  console.log(`Generating atlas for ${iconNames.length} icons`);

  // Calculate grid layout
  const cellWidth = iconWidth + padding;
  const cellHeight = iconHeight + padding;
  const cols = Math.floor(atlasWidth / cellWidth);
  const rows = Math.floor(atlasHeight / cellHeight);
  const maxIcons = cols * rows;

  console.log(`Atlas grid: ${cols} cols × ${rows} rows = ${maxIcons} max icons`);

  if (iconNames.length > maxIcons) {
    console.error(`ERROR: Too many icons (${iconNames.length}) for atlas size.`);
    process.exit(1);
  }

  // Check which icons exist
  const compositeOps = [];
  const iconMapping = {};
  const missing = [];

  for (let i = 0; i < iconNames.length; i++) {
    const iconName = iconNames[i];
    const filePath = path.join(iconsDir, `${iconName}.png`);

    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellWidth;
    const y = row * cellHeight;

    if (fs.existsSync(filePath)) {
      compositeOps.push({
        input: filePath,
        left: x,
        top: y,
      });
    } else {
      missing.push(iconName);
    }

    // Always add to mapping (even if missing, for debugging)
    iconMapping[iconName] = {
      x,
      y,
      width: iconWidth,
      height: iconHeight,
      anchorY: iconHeight,
      mask: false,
    };
  }

  if (missing.length > 0) {
    console.warn(`\nWARNING: ${missing.length} icons not found:`);
    missing.slice(0, 10).forEach(m => console.warn(`  - ${m}.png`));
    if (missing.length > 10) console.warn(`  ... and ${missing.length - 10} more`);
    console.warn('');
  }

  console.log(`Found ${compositeOps.length}/${iconNames.length} icon files`);
  console.log('Generating atlas...');

  // Create atlas image
  await sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(compositeOps)
    .png({ compressionLevel: 9 })
    .toFile(atlasOutput);

  console.log(`✓ Atlas saved: ${atlasOutput}`);

  // Save mapping JSON
  fs.writeFileSync(mappingOutput, JSON.stringify(iconMapping, null, 2));
  console.log(`✓ Mapping saved: ${mappingOutput}`);

  // Stats
  const atlasStats = fs.statSync(atlasOutput);
  const mappingStats = fs.statSync(mappingOutput);

  console.log('\n' + '='.repeat(50));
  console.log('STATS:');
  console.log('='.repeat(50));
  console.log(`Icons in atlas: ${compositeOps.length}`);
  console.log(`Atlas dimensions: ${atlasWidth} × ${atlasHeight}`);
  console.log(`Atlas file size: ${(atlasStats.size / 1024).toFixed(1)} KB`);
  console.log(`Mapping file size: ${(mappingStats.size / 1024).toFixed(1)} KB`);

  // Compare to individual files
  let totalIndividualSize = 0;
  for (const op of compositeOps) {
    totalIndividualSize += fs.statSync(op.input).size;
  }
  console.log(`\nOriginal ${compositeOps.length} files: ${(totalIndividualSize / 1024).toFixed(1)} KB`);
  console.log(`Atlas + mapping: ${((atlasStats.size + mappingStats.size) / 1024).toFixed(1)} KB`);
  console.log(`Network requests reduced: ${compositeOps.length} → 2`);
}

generateAtlas().catch(console.error);
