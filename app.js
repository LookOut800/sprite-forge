// Hero page wiring: hands the shared editor engine the humanoid shape
// generator, then adds the one hero-only feature — the pose sheet — on top,
// using the engine's public state/showToast rather than reaching into it.
(() => {
  "use strict";
  const { createEditor, downloadCanvas } = window.SpriteTool;
  const { W, H, PRESET_LABELS, PALETTES, makeRecipe, buildGrid, buildPoseSheetCanvas } = window.SpriteTool.hero;

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
    defaultPresetKey: "warrior",
    makeRecipe,
    buildGrid,
    galleryKey: "spriteforge.gallery",
    defaultCellPx: 16,
    exportCell: 16,
    filenamePrefix: "sprite",
  });

  // pose sheet — hero-only, built on top of the shared engine's live state
  let poseSheetCanvas = null;
  const poseModalBackdrop = document.getElementById("poseModalBackdrop");
  function closePoseModal() { poseModalBackdrop.hidden = true; }
  document.getElementById("poseSheetBtn").addEventListener("click", () => {
    if (!editor.state.lastRecipe || !editor.state.lastColors) {
      editor.showToast("This sprite has no shape data to pose — generate one first.");
      return;
    }
    poseSheetCanvas = buildPoseSheetCanvas(editor.state.lastRecipe, editor.state.lastColors, editor.state.pixels);
    const modalCanvas = document.getElementById("poseModalCanvas");
    modalCanvas.width = poseSheetCanvas.width;
    modalCanvas.height = poseSheetCanvas.height;
    const mctx = modalCanvas.getContext("2d");
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(poseSheetCanvas, 0, 0);
    poseModalBackdrop.hidden = false;
  });
  document.getElementById("poseModalClose").addEventListener("click", closePoseModal);
  document.getElementById("poseModalClose2").addEventListener("click", closePoseModal);
  poseModalBackdrop.addEventListener("click", (e) => { if (e.target === poseModalBackdrop) closePoseModal(); });
  document.getElementById("poseModalDownload").addEventListener("click", () => {
    if (!poseSheetCanvas) return;
    downloadCanvas(poseSheetCanvas, "pose-sheet.png");
    editor.showToast("Exported pose sheet.");
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePoseModal(); });

  editor.boot();
})();
