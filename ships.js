// Ship page wiring — the same shared editor engine as the hero page, handed
// the ship-shapes generator instead. No pose sheet: ships don't pose.
(() => {
  "use strict";
  const { createEditor } = window.SpriteTool;
  const { W, H, PRESET_LABELS, PALETTES, makeRecipe, buildGrid, buildGridSide } = window.SpriteTool.ship;

  const editor = createEditor({
    W, H,
    canvas: document.getElementById("pixels"),
    toastEl: document.getElementById("toast"),
    swatchesEl: document.getElementById("swatches"),
    galleryStripEl: document.getElementById("galleryStrip"),
    palettePreviewEl: document.getElementById("palettePreview"),
    seedDisplayEl: document.getElementById("seedDisplay"),
    presetSel: document.getElementById("presetSel"),
    paletteSel: document.getElementById("paletteSel"),
    buttons: {
      generate: document.getElementById("generateBtn"),
      reshape: document.getElementById("reshapeBtn"),
      recolor: document.getElementById("recolorBtn"),
      copyLink: document.getElementById("copyLinkBtn"),
      save: document.getElementById("saveBtn"),
      sheet: document.getElementById("sheetBtn"),
      download: document.getElementById("downloadBtn"),
      undo: document.getElementById("undoBtn"),
      redo: document.getElementById("redoBtn"),
      flip: document.getElementById("flipBtn"),
      clear: document.getElementById("clearBtn"),
      importPng: document.getElementById("importBtn"),
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
    defaultCellPx: 9,
    exportCell: 12,
    filenamePrefix: "ship",
  });

  // side-view preview — a read-only second canvas showing the same hull
  // recipe from the side instead of from above. It has no pointer handling
  // of its own and never feeds back into the editable top-down canvas; it
  // just redraws from state.lastRecipe/lastColors whenever those change.
  const sideCanvas = document.getElementById("sideView");
  const sideCtx = sideCanvas.getContext("2d");
  const SIDE_CELL = 6;
  sideCanvas.width = W * SIDE_CELL;
  sideCanvas.height = H * SIDE_CELL;

  function drawSideView() {
    const { lastRecipe, lastColors } = editor.state;
    sideCtx.imageSmoothingEnabled = false;
    sideCtx.clearRect(0, 0, sideCanvas.width, sideCanvas.height);
    if (!lastRecipe || !lastColors) return;
    const grid = buildGridSide(lastRecipe, lastColors);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y * W + x];
      if (c) { sideCtx.fillStyle = c; sideCtx.fillRect(x * SIDE_CELL, y * SIDE_CELL, SIDE_CELL, SIDE_CELL); }
    }
  }

  // Polling rather than hooking every button (generate/reshape/recolor/
  // gallery-load/clear all change lastRecipe) keeps this file from having to
  // know every place the shared engine can change that state.
  let lastSeenRecipe;
  setInterval(() => {
    if (editor.state.lastRecipe !== lastSeenRecipe) {
      lastSeenRecipe = editor.state.lastRecipe;
      drawSideView();
    }
  }, 200);

  editor.boot();
  drawSideView();
})();
