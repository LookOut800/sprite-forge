// Hero page wiring: hands the shared editor engine the humanoid shape
// generator, then adds the one hero-only feature — the pose sheet — on top,
// using the engine's public state/showToast rather than reaching into it.
(() => {
  "use strict";
  const { createEditor, downloadCanvas } = window.SpriteTool;
  const { W, H, PRESET_LABELS, PALETTES, makeRecipe, buildGrid, buildGridBack,
          buildPoseSheetCanvas, buildRunCycleFrames } = window.SpriteTool.hero;

  const editor = createEditor({
    W, H,
    canvas: document.getElementById("pixels"),
    toastEl: document.getElementById("toast"),
    swatchesEl: document.getElementById("swatches"),
    galleryStripEl: document.getElementById("galleryStrip"),
    palettePreviewEl: document.getElementById("palettePreview"),
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

  // run cycle preview — an animated loop through several sine-interpolated
  // frames of the same profile-view swing math the static run poses use,
  // to show off smoother in-between motion than just the two extremes
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

  // turntable — an experimental "spin the character" preview. This is NOT a
  // real 3D model: front and back share the exact same silhouette (only the
  // face differs), so a genuine turn only needs a cosine-based horizontal
  // squash of whichever one is currently facing the camera — the classic
  // "billboard rotation" trick, using only geometry we actually have. It
  // deliberately does NOT try to render the true asymmetric side silhouette
  // mid-turn (buildGridProfile is a structurally different shape — see the
  // pose sheet's side view for the real one); that would mean inventing
  // detail we've never observed, the same problem AI video-frame tools have.
  const TURNTABLE_CELL = 16, TURNTABLE_SPIN_STEP_DEG = 3, TURNTABLE_SPIN_MS = 40;
  const MIN_TURN_SCALE = 0.12;
  let turntableFrontGrid = null, turntableBackGrid = null, turntableSpinTimer = null;
  const turntableModalBackdrop = document.getElementById("turntableModalBackdrop");
  const turntableCanvas = document.getElementById("turntableCanvas");
  const turntableCtx = turntableCanvas.getContext("2d");
  const turntableSlider = document.getElementById("turntableSlider");
  const turntableSpinChk = document.getElementById("turntableSpinChk");

  function drawTurntableAt(angleDeg) {
    const cosv = Math.cos((angleDeg * Math.PI) / 180);
    const scale = Math.max(MIN_TURN_SCALE, Math.abs(cosv));
    const grid = cosv >= 0 ? turntableFrontGrid : turntableBackGrid;

    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const octx = off.getContext("2d");
    octx.imageSmoothingEnabled = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[y * W + x];
      if (c) { octx.fillStyle = c; octx.fillRect(x, y, 1, 1); }
    }

    const fullW = W * TURNTABLE_CELL, fullH = H * TURNTABLE_CELL;
    turntableCanvas.width = fullW;
    turntableCanvas.height = fullH;
    turntableCtx.imageSmoothingEnabled = false;
    turntableCtx.clearRect(0, 0, fullW, fullH);
    const dw = Math.max(1, Math.round(fullW * scale));
    const dx = Math.round((fullW - dw) / 2);
    turntableCtx.drawImage(off, 0, 0, W, H, dx, 0, dw, fullH);
  }
  function closeTurntableModal() {
    turntableModalBackdrop.hidden = true;
    clearInterval(turntableSpinTimer);
    turntableSpinTimer = null;
    turntableSpinChk.checked = false;
  }
  document.getElementById("turntableBtn").addEventListener("click", () => {
    if (!editor.state.lastRecipe || !editor.state.lastColors) {
      editor.showToast("This sprite has no shape data to turn — generate one first.");
      return;
    }
    turntableFrontGrid = editor.state.pixels.slice();
    turntableBackGrid = buildGridBack(editor.state.lastRecipe, editor.state.lastColors, editor.state.pixels);
    turntableSlider.value = 0;
    drawTurntableAt(0);
    turntableModalBackdrop.hidden = false;
  });
  turntableSlider.addEventListener("input", (e) => drawTurntableAt(parseInt(e.target.value, 10)));
  turntableSpinChk.addEventListener("change", (e) => {
    clearInterval(turntableSpinTimer);
    turntableSpinTimer = null;
    if (e.target.checked) {
      turntableSpinTimer = setInterval(() => {
        const next = (parseInt(turntableSlider.value, 10) + TURNTABLE_SPIN_STEP_DEG) % 360;
        turntableSlider.value = next;
        drawTurntableAt(next);
      }, TURNTABLE_SPIN_MS);
    }
  });
  document.getElementById("turntableModalClose").addEventListener("click", closeTurntableModal);
  document.getElementById("turntableModalClose2").addEventListener("click", closeTurntableModal);
  turntableModalBackdrop.addEventListener("click", (e) => { if (e.target === turntableModalBackdrop) closeTurntableModal(); });
  document.getElementById("turntableModalDownload").addEventListener("click", () => {
    downloadCanvas(turntableCanvas, "turntable-frame.png");
    editor.showToast("Downloaded current angle.");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePoseModal(); closeRunCycleModal(); closeTurntableModal(); }
  });

  editor.boot();
})();
