// Ship page wiring — the same shared editor engine as the hero page, handed
// the ship-shapes generator instead. No pose sheet: ships don't pose.
(() => {
  "use strict";
  const { createEditor } = window.SpriteTool;
  const { W, H, PRESET_LABELS, PALETTES, makeRecipe, buildGrid } = window.SpriteTool.ship;

  const editor = createEditor({
    W, H,
    canvas: document.getElementById("pixels"),
    toastEl: document.getElementById("toast"),
    swatchesEl: document.getElementById("swatches"),
    galleryStripEl: document.getElementById("galleryStrip"),
    presetSel: document.getElementById("presetSel"),
    paletteSel: document.getElementById("paletteSel"),
    buttons: {
      generate: document.getElementById("generateBtn"),
      reshape: document.getElementById("reshapeBtn"),
      recolor: document.getElementById("recolorBtn"),
      save: document.getElementById("saveBtn"),
      sheet: document.getElementById("sheetBtn"),
      download: document.getElementById("downloadBtn"),
      undo: document.getElementById("undoBtn"),
      redo: document.getElementById("redoBtn"),
      flip: document.getElementById("flipBtn"),
      clear: document.getElementById("clearBtn"),
    },
    checks: {
      symmetry: document.getElementById("symmetryChk"),
      grid: document.getElementById("gridChk"),
    },
    zoomRangeEl: document.getElementById("zoomRange"),
    palettes: PALETTES,
    defaultPaletteKey: "c64",
    presetLabels: PRESET_LABELS,
    defaultPresetKey: "fighter",
    makeRecipe,
    buildGrid,
    galleryKey: "spriteforge.ships.gallery",
    defaultCellPx: 16,
    exportCell: 16,
    filenamePrefix: "ship",
  });

  editor.boot();
})();
