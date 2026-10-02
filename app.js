// Hero page wiring: hands the shared editor engine the humanoid shape
// generator, then adds hero-only features on top — an editable multi-frame
// pose sheet, an animated run-cycle preview — using the engine's public
// state/frame API rather than reaching into its internals.
(() => {
  "use strict";
  const { createEditor, downloadCanvas } = window.SpriteTool;
  const { W, H, PRESET_LABELS, PALETTES, makeRecipe, buildGrid, buildGridBack,
          buildGridProfile, buildGridJump, buildRunCycleFrames } = window.SpriteTool.hero;

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
      saveSheet: document.getElementById("saveSheetBtn"),
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

  // ---- editable multi-frame pose sheet -------------------------------------
  // "Generate poses" bakes back/side/run/jump from the front view into named
  // frames on the shared engine; the tabs below just call editor.switchFrame,
  // so every existing tool (pencil, fill, mirror, undo...) already works on
  // whichever pose is active — no new drawing code needed for this at all.
  const FRAME_ORDER = [
    ["front", "Front"], ["back", "Back"], ["side", "Side"],
    ["run1", "Run 1"], ["run2", "Run 2"], ["jumpr", "Jump →"], ["jumpl", "Jump ←"],
  ];
  const frameTabsEl = document.getElementById("frameTabs");
  function renderFrameTabs() {
    const frames = editor.allFrames();
    const ids = Object.keys(frames);
    frameTabsEl.innerHTML = "";
    if (ids.length <= 1) { frameTabsEl.hidden = true; return; }
    frameTabsEl.hidden = false;
    FRAME_ORDER.forEach(([id, label]) => {
      if (!(id in frames)) return;
      const b = document.createElement("button");
      b.className = "tbtn";
      b.textContent = label;
      b.setAttribute("aria-pressed", id === editor.state.activeFrameId ? "true" : "false");
      b.addEventListener("click", () => { editor.switchFrame(id); renderFrameTabs(); });
      frameTabsEl.appendChild(b);
    });
  }
  document.getElementById("genPosesBtn").addEventListener("click", () => {
    if (!editor.state.lastRecipe || !editor.state.lastColors) {
      editor.showToast("This sprite has no shape data to pose — generate one first.");
      return;
    }
    if (editor.state.activeFrameId !== "front") {
      editor.showToast("Switch back to the Front tab first — poses are generated from it.");
      return;
    }
    const { lastRecipe: recipe, lastColors: colors, pixels: frontPixels } = editor.state;
    editor.setFrame("back", buildGridBack(recipe, colors, frontPixels));
    editor.setFrame("side", buildGridProfile(recipe, colors, frontPixels, 0));
    editor.setFrame("run1", buildGridProfile(recipe, colors, frontPixels, 1));
    editor.setFrame("run2", buildGridProfile(recipe, colors, frontPixels, -1));
    editor.setFrame("jumpr", buildGridJump(recipe, colors, frontPixels, 1));
    editor.setFrame("jumpl", buildGridJump(recipe, colors, frontPixels, -1));
    renderFrameTabs();
    editor.showToast("Generated poses — switch tabs above the canvas to edit each one.");
  });
  // a fresh generate/reshape/recolour invalidates any already-generated
  // poses (the engine already clears them); just keep the tabs in sync
  ["generateBtn", "reshapeBtn", "recolorBtn"].forEach(id => {
    document.getElementById(id).addEventListener("click", renderFrameTabs);
  });
  // gallery loads/deletes can also change the frame set; the gallery's own
  // items are rebuilt on every click, so listen on the container instead
  document.getElementById("galleryStrip").addEventListener("click", () => setTimeout(renderFrameTabs, 0));

  // merged sheet preview — assembles whatever frames currently exist (with
  // any hand edits) into one labelled strip, reusing the existing modal
  let poseSheetCanvas = null;
  const poseModalBackdrop = document.getElementById("poseModalBackdrop");
  function closePoseModal() { poseModalBackdrop.hidden = true; }
  function buildMergedSheetCanvas() {
    const frames = editor.allFrames();
    const order = FRAME_ORDER.filter(([id]) => id in frames);
    const cell = 12, pad = 6, labelH = 16;
    const cw = W * cell, ch = H * cell;
    const canvas = document.createElement("canvas");
    canvas.width = order.length * (cw + pad) + pad;
    canvas.height = ch + labelH + pad * 2;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    order.forEach(([id, label], i) => {
      const grid = frames[id];
      const ox = pad + i * (cw + pad), oy = pad;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = grid[y * W + x];
        if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
      }
      ctx.fillStyle = "#9c93c9";
      ctx.font = "11px 'VT323', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label.toLowerCase(), ox + cw / 2, oy + ch + 12);
    });
    return canvas;
  }
  document.getElementById("poseSheetBtn").addEventListener("click", () => {
    if (!editor.state.lastRecipe || !editor.state.lastColors) {
      editor.showToast("This sprite has no shape data to pose — generate one first.");
      return;
    }
    poseSheetCanvas = buildMergedSheetCanvas();
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

  // run cycle preview — an animated loop through several sine-interpolated
  // frames of the same profile-view swing math the static run poses use,
  // to show off smoother in-between motion than just the two extremes.
  // Always generated from the Front frame, same rule as "Generate poses".
  const RUN_CYCLE_CELL = 12, RUN_CYCLE_FPS_MS = 120;
  let runCycleFrames = null, runCycleTimer = null, runCycleIdx = 0;
  const runCycleModalBackdrop = document.getElementById("runCycleModalBackdrop");
  const runCycleCanvas = document.getElementById("runCycleCanvas");
  const runCycleCtx = runCycleCanvas.getContext("2d");
  function closeRunCycleModal() {
    runCycleModalBackdrop.hidden = true;
    clearInterval(runCycleTimer);
    runCycleTimer = null;
  }
  function drawRunCycleFrame() {
    const grid = runCycleFrames[runCycleIdx];
    runCycleCtx.imageSmoothingEnabled = false;
    runCycleCtx.clearRect(0, 0, runCycleCanvas.width, runCycleCanvas.height);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y * W + x];
      if (c) { runCycleCtx.fillStyle = c; runCycleCtx.fillRect(x * RUN_CYCLE_CELL, y * RUN_CYCLE_CELL, RUN_CYCLE_CELL, RUN_CYCLE_CELL); }
    }
    runCycleIdx = (runCycleIdx + 1) % runCycleFrames.length;
  }
  document.getElementById("runCycleBtn").addEventListener("click", () => {
    if (!editor.state.lastRecipe || !editor.state.lastColors) {
      editor.showToast("This sprite has no shape data to pose — generate one first.");
      return;
    }
    if (editor.state.activeFrameId !== "front") {
      editor.showToast("Switch back to the Front tab first — the run cycle is generated from it.");
      return;
    }
    runCycleFrames = buildRunCycleFrames(editor.state.lastRecipe, editor.state.lastColors, editor.state.pixels, 8);
    runCycleCanvas.width = W * RUN_CYCLE_CELL;
    runCycleCanvas.height = H * RUN_CYCLE_CELL;
    runCycleIdx = 0;
    drawRunCycleFrame();
    clearInterval(runCycleTimer);
    runCycleTimer = setInterval(drawRunCycleFrame, RUN_CYCLE_FPS_MS);
    runCycleModalBackdrop.hidden = false;
  });
  document.getElementById("runCycleModalClose").addEventListener("click", closeRunCycleModal);
  document.getElementById("runCycleModalClose2").addEventListener("click", closeRunCycleModal);
  runCycleModalBackdrop.addEventListener("click", (e) => { if (e.target === runCycleModalBackdrop) closeRunCycleModal(); });
  document.getElementById("runCycleModalDownload").addEventListener("click", () => {
    if (!runCycleFrames) return;
    const cell = 12, pad = 4;
    const cw = W * cell, ch = H * cell;
    const strip = document.createElement("canvas");
    strip.width = runCycleFrames.length * (cw + pad) + pad;
    strip.height = ch + pad * 2;
    const sctx = strip.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    runCycleFrames.forEach((grid, i) => {
      const ox = pad + i * (cw + pad), oy = pad;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = grid[y * W + x];
        if (c) { sctx.fillStyle = c; sctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
      }
    });
    downloadCanvas(strip, "run-cycle-strip.png");
    editor.showToast("Exported run cycle strip.");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePoseModal(); closeRunCycleModal(); }
  });

  editor.boot();
  renderFrameTabs();
})();
