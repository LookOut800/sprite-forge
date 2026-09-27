#!/usr/bin/env python3
"""Regenerate originals_contact_sheet.png — a labelled grid of every file in
originals/, for a quick visual index of the character catalog.

Usage: python3 catalog_sheet.py
Requires: Pillow (pip install pillow)
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "originals")
OUT = os.path.join(HERE, "originals_contact_sheet.png")

COLS = 5
CELL = 130
PAD = 14
LABEL_H = 20
BG = (20, 18, 30)
CELL_BG = (40, 36, 55, 255)
LABEL_COLOR = (200, 195, 220)


def main():
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith(".png"))
    rows = (len(files) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * (CELL + PAD) + PAD, rows * (CELL + PAD + LABEL_H) + PAD), BG)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for i, fname in enumerate(files):
        im = Image.open(os.path.join(SRC, fname)).convert("RGBA")
        im.thumbnail((CELL, CELL))
        cell_img = Image.new("RGBA", (CELL, CELL), CELL_BG)
        ox, oy = (CELL - im.width) // 2, (CELL - im.height) // 2
        cell_img.alpha_composite(im, (ox, oy))
        cx = PAD + (i % COLS) * (CELL + PAD)
        cy = PAD + (i // COLS) * (CELL + PAD + LABEL_H)
        sheet.paste(cell_img.convert("RGB"), (cx, cy))
        draw.text((cx, cy + CELL + 3), fname.replace(".png", ""), fill=LABEL_COLOR, font=font)

    sheet.save(OUT)
    print(f"wrote {OUT} ({len(files)} characters)")


if __name__ == "__main__":
    main()
