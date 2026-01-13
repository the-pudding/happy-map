#!/usr/bin/env python3
"""
Process PNG images to create two versions:
- '-active': Purple tinted version
- '-default': Extreme contrast - pure black and light beige only
"""
import os
import sys
from PIL import Image
import numpy as np
from pathlib import Path

def tint_image_purple(image_path, output_path, purple_rgb=(128, 0, 128), blend_factor=0.5):
    """
    Apply a purple tint to an image while preserving transparency.
    """
    # Open image and ensure RGBA mode
    img = Image.open(image_path).convert('RGBA')
    # Convert to numpy array
    data = np.array(img)
    # Separate RGB and alpha channels
    rgb = data[:, :, :3]
    alpha = data[:, :, 3]
    # Create purple overlay
    purple_overlay = np.full_like(rgb, purple_rgb)
    # Blend original with purple (only where there's content)
    mask = alpha > 0
    tinted_rgb = rgb.copy()
    tinted_rgb[mask] = (
        rgb[mask] * (1 - blend_factor) +
        purple_overlay[mask] * blend_factor
    ).astype(np.uint8)
    # Recombine with original alpha
    tinted_data = np.dstack((tinted_rgb, alpha))
    # Convert back to PIL Image and save
    tinted_img = Image.fromarray(tinted_data, 'RGBA')
    tinted_img.save(output_path, 'PNG')

def create_light_version(image_path, output_path, beige_rgb=(245, 235, 220)):
    """
    Create MAXIMUM contrast version - only pure black or light beige, nothing in between.
    """
    # Open image and ensure RGBA mode
    img = Image.open(image_path).convert('RGBA')
    # Convert to numpy array
    data = np.array(img)
    # Separate RGB and alpha channels
    rgb = data[:, :, :3].astype(np.float32)
    alpha = data[:, :, 3]

    # Calculate luminance for each pixel
    luminance = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    # Only process where there's content
    mask = alpha > 0
    lightened_rgb = rgb.copy()

    # MAXIMUM CONTRAST: Binary threshold - either pure black or beige
    # Adjust this threshold to control what becomes black vs beige
    threshold = 127  # Mid-point - anything darker than 50% becomes pure black

    # Create pure black and beige colors
    pure_black = np.array([0, 0, 0])
    beige = np.array(beige_rgb)

    # Apply binary contrast
    black_mask = (luminance < threshold) & mask
    beige_mask = (luminance >= threshold) & mask

    # Set to pure black or beige - no in-between values
    for i in range(3):
        lightened_rgb[:, :, i][black_mask] = pure_black[i]
        lightened_rgb[:, :, i][beige_mask] = beige[i]

    lightened_rgb = lightened_rgb.astype(np.uint8)

    # Recombine with original alpha
    lightened_data = np.dstack((lightened_rgb, alpha))

    # Convert back to PIL Image and save
    lightened_img = Image.fromarray(lightened_data, 'RGBA')
    lightened_img.save(output_path, 'PNG')

def process_directory(input_dir, purple_rgb=(128, 0, 128), blend_factor=0.5):
    """
    Process all PNG images in a directory, creating both -active and -default versions.
    """
    input_path = Path(input_dir)
    if not input_path.exists():
        print(f"Error: Directory '{input_dir}' does not exist")
        return

    # Find all PNG files (excluding ones that already have suffixes)
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
    print(f"Creating -active (purple) and -default (binary contrast) versions")

    # Process each image
    processed = 0
    for img_file in png_files:
        try:
            # Create -active version (purple)
            active_file = img_file.parent / f"{img_file.stem}-active{img_file.suffix}"
            print(f"Processing: {img_file.name}")
            print(f"  → {active_file.name} (purple)")
            tint_image_purple(img_file, active_file, purple_rgb, blend_factor)

            # Create -default version (binary black/beige)
            default_file = img_file.parent / f"{img_file.stem}-default{img_file.suffix}"
            print(f"  → {default_file.name} (binary contrast)")
            create_light_version(img_file, default_file)

            processed += 1
        except Exception as e:
            print(f"Error processing {img_file.name}: {e}")

    print(f"\nDone! Processed {processed} images (created {processed * 2} versions)")

if __name__ == "__main__":
    # Configuration
    INPUT_DIRECTORY = "."  # Current directory, change as needed

    # Purple for -active version
    PURPLE_RGB = (255, 46, 178)  # Your specified purple
    BLEND_FACTOR = 0.5  # 0=no tint, 1=full purple

    # Command line usage
    if len(sys.argv) > 1:
        INPUT_DIRECTORY = sys.argv[1]
        if len(sys.argv) > 2:
            BLEND_FACTOR = float(sys.argv[2])

    process_directory(INPUT_DIRECTORY, PURPLE_RGB, BLEND_FACTOR)
