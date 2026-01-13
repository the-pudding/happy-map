#!/usr/bin/env python3
"""
Process PNG images to create fantasy-styled versions:
- '-active': Colored/highlighted version (preserving blacks)
- '-default': Parchment/sepia toned version (preserving blacks)
"""
import os
import sys
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np
from pathlib import Path

def create_fantasy_active(image_path, output_path, highlight_color=(255, 46, 178), blend_factor=0.4):
    """
    Create a fantasy-styled active version with color highlight, preserving pure blacks.
    """
    img = Image.open(image_path).convert('RGBA')

    # REMOVED BLUR - going straight to enhance
    # Enhance contrast for more dramatic effect
    enhancer = ImageEnhance.Contrast(img)
    enhanced = enhancer.enhance(1.2)  # Reduced from 1.3 for less harshness

    data = np.array(enhanced)
    rgb = data[:, :, :3].astype(np.float32)
    alpha = data[:, :, 3]

    # Calculate luminance to identify black areas
    luminance = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    # Create masks
    mask = alpha > 0
    black_threshold = 30  # Anything darker than this stays black
    is_black = (luminance < black_threshold) & mask
    is_not_black = (luminance >= black_threshold) & mask

    # Apply colored highlight ONLY to non-black areas
    highlight_overlay = np.full_like(rgb, highlight_color)
    tinted_rgb = rgb.copy()

    # Keep blacks pure black
    tinted_rgb[is_black] = rgb[is_black] * 0.8  # Darken blacks even more

    # Apply tint only to non-black areas
    tinted_rgb[is_not_black] = (
        rgb[is_not_black] * (1 - blend_factor) +
        highlight_overlay[is_not_black] * blend_factor
    )

    tinted_rgb = np.clip(tinted_rgb, 0, 255).astype(np.uint8)
    tinted_data = np.dstack((tinted_rgb, alpha))
    tinted_img = Image.fromarray(tinted_data, 'RGBA')

    # Optional: Add sharpening to make edges crisper
    tinted_img = tinted_img.filter(ImageFilter.SHARPEN)

    tinted_img.save(output_path, 'PNG')

def create_fantasy_default(image_path, output_path):
    """
    Create a parchment/fantasy map style version, keeping blacks pure black.
    """
    img = Image.open(image_path).convert('RGBA')
    data = np.array(img)
    rgb = data[:, :, :3].astype(np.float32)
    alpha = data[:, :, 3]

    # Calculate luminance
    luminance = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    mask = alpha > 0
    styled_rgb = rgb.copy()

    # Fantasy parchment colors
    pure_black = np.array([0, 0, 0])  # Keep blacks pure
    ink_color = np.array([45, 35, 25])  # Dark brown for mid-tones
    parchment_color = np.array([250, 245, 230])  # Off-white parchment

    # Three zones: pure black, brown ink, parchment
    black_threshold = 50  # Anything below this stays pure black
    ink_threshold = 140   # Between black and this becomes brown

    pure_black_mask = (luminance < black_threshold) & mask
    ink_mask = ((luminance >= black_threshold) & (luminance < ink_threshold)) & mask
    parchment_mask = (luminance >= ink_threshold) & mask

    # Apply colors
    for i in range(3):
        # Pure blacks stay pure black
        styled_rgb[:, :, i][pure_black_mask] = pure_black[i]

        # Mid-tones become brown ink with variation
        if np.any(ink_mask):
            ink_variation = ((luminance[ink_mask] - black_threshold) / (ink_threshold - black_threshold)) * 0.5 + 0.5
            styled_rgb[:, :, i][ink_mask] = ink_color[i] * ink_variation

        # Light areas become parchment
        if np.any(parchment_mask):
            parchment_variation = 0.95 + (luminance[parchment_mask] - ink_threshold) / (255 - ink_threshold) * 0.05
            styled_rgb[:, :, i][parchment_mask] = parchment_color[i] * parchment_variation

    styled_rgb = np.clip(styled_rgb, 0, 255).astype(np.uint8)

    # REMOVED noise for cleaner look

    styled_data = np.dstack((styled_rgb, alpha))
    styled_img = Image.fromarray(styled_data, 'RGBA')

    # Keep sharpening for crisper edges
    styled_img = styled_img.filter(ImageFilter.SHARPEN)

    styled_img.save(output_path, 'PNG')

def process_directory(input_dir, highlight_color=(255, 46, 178), blend_factor=0.4):
    """
    Process all PNG images in a directory for fantasy map styling.
    """
    input_path = Path(input_dir)
    if not input_path.exists():
        print(f"Error: Directory '{input_dir}' does not exist")
        return

    png_files = []
    for file in input_path.glob('*.png'):
        if '-active' not in file.stem and '-default' not in file.stem:
            png_files.append(file)
    for file in input_path.glob('*.PNG'):
        if '-active' not in file.stem and '-default' not in file.stem:
            png_files.append(file)

    if not png_files:
        print(f"No PNG files found in '{input_dir}' (excluding -active and -default files)")
        return

    print(f"Found {len(png_files)} PNG files to process")
    print(f"Creating fantasy-styled versions (preserving blacks, no blur)")

    processed = 0
    for img_file in png_files:
        try:
            active_file = img_file.parent / f"{img_file.stem}-active{img_file.suffix}"
            print(f"Processing: {img_file.name}")
            print(f"  → {active_file.name} (fantasy active)")
            create_fantasy_active(img_file, active_file, highlight_color, blend_factor)

            default_file = img_file.parent / f"{img_file.stem}-default{img_file.suffix}"
            print(f"  → {default_file.name} (parchment style)")
            create_fantasy_default(img_file, default_file)

            processed += 1
        except Exception as e:
            print(f"Error processing {img_file.name}: {e}")

    print(f"\nDone! Processed {processed} images (created {processed * 2} versions)")

if __name__ == "__main__":
    INPUT_DIRECTORY = "."

    # Fantasy color options for active state:
    HIGHLIGHT_COLOR = (255, 46, 178)    # Your pink/magenta
    BLEND_FACTOR = 0.4  # Reduced for subtler effect

    if len(sys.argv) > 1:
        INPUT_DIRECTORY = sys.argv[1]
        if len(sys.argv) > 2:
            BLEND_FACTOR = float(sys.argv[2])

    process_directory(INPUT_DIRECTORY, HIGHLIGHT_COLOR, BLEND_FACTOR)
