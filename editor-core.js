// Shared pixel-editor engine — everything that doesn't care what's being
// drawn: the canvas, drawing tools, undo/redo, mirror symmetry, palette
// swatches, the gallery, sheet export and single-sprite download. A caller
// supplies the grid size and a shape generator (makeRecipe/buildGrid); this
// file supplies the editor around it. Plain global script (no bundler), so
// it attaches itself to window.SpriteTool for other plain scripts to use.
(() => {
  "use strict";
  const DARK = "#281e23", WHITE = "#ffffff";

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Picks a set of indices in [0,length) to "damage" as a few short
  // contiguous runs rather than independent per-index coin flips. Bernoulli
  // noise (Math.random() < p at every index) reads as all-over static —
  // real battle damage or a panel gap is a handful of multi-pixel notches,
  // not scattered single pixels. `coverage` is roughly the fraction of
  // indices that end up picked; runs are 1-`maxRun` long.
  function pickNoiseRuns(length, coverage, maxRun = 3) {
    const picked = new Set();
    let budget = Math.round(length * coverage);
    let guard = length * 2; // a budget that can't be placed shouldn't hang
    while (budget > 0 && guard-- > 0) {
      const runLen = Math.min(budget, 1 + Math.floor(Math.random() * maxRun));
      const start = Math.floor(Math.random() * length);
      for (let k = 0; k < runLen && start + k < length; k++) picked.add(start + k);
      budget -= runLen;
    }
    return picked;
  }

  // Fills every still-empty cell that's orthogonally adjacent to a filled
  // one with `outlineColor` — a one-pixel silhouette outline around whatever
  // shape was drawn. `idx` maps (x,y) to a grid index, or -1 if out of range.
  function outlinePass(grid, W, H, idx, outlineColor = DARK) {
    const src = grid.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (src[i] !== null) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = idx(x + dx, y + dy);
        if (ni >= 0 && src[ni] !== null) { grid[i] = outlineColor; break; }
      }
    }
  }

  function downloadCanvas(canvas, filename) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  // config: { W, H, canvas, toastEl, swatchesEl, galleryStripEl, presetSel,
  //   paletteSel, buttons:{generate,reshape,recolor,save,sheet,download,
  //   undo,redo,flip,clear}, checks:{symmetry,grid}, zoomRangeEl,
  //   palettes:{key:[colors]}, defaultPaletteKey, presetLabels:{key:label},
  //   defaultPresetKey, makeRecipe(key), buildGrid(recipe,colors),
  //   galleryKey, defaultCellPx, exportCell, filenamePrefix }
  function createEditor(config) {
    const {
      W, H, canvas, toastEl, swatchesEl, galleryStripEl, palettePreviewEl,
      presetSel, paletteSel, buttons, checks, zoomRangeEl,
      palettes, defaultPaletteKey, presetLabels, defaultPresetKey,
      makeRecipe, buildGrid, galleryKey,
      defaultCellPx = 16, exportCell = 16, filenamePrefix = "sprite",
    } = config;

    const ctx = canvas.getContext("2d");
    let toastTimer = null;
    const firstPaletteKey = defaultPaletteKey || Object.keys(palettes)[0];

    const state = {
      pixels: new Array(W * H).fill(null),
      tool: "pencil",
      color: (palettes[firstPaletteKey] || [])[0] || "#70A4B2",
      symmetry: true,
      showGrid: false,
      cellPx: defaultCellPx,
      undoStack: [],
      redoStack: [],
      gallery: [],
      lastPreset: null,
      lastRecipe: null,
      lastColors: null,
      // Named frames (e.g. a hero's back/side/run/jump poses): state.pixels
      // is always the buffer for whichever frame is "active" — every tool
      // above reads/writes it exactly as if there were only one frame —
      // while state.frames stashes every OTHER frame's buffer. A consumer
      // decides what the frame ids mean; the engine just keeps them named
      // and lets you switch which one is live for editing.
      frames: {},
      activeFrameId: "front",
    };

    function showToast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
    }

    let cssCache = {};
    function getCss(varName) {
      if (!cssCache[varName]) cssCache[varName] = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      return cssCache[varName];
    }

    function render() {
      const cell = state.cellPx;
      canvas.width = W * cell;
      canvas.height = H * cell;
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? getCss("--checker-a") : getCss("--checker-b");
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = state.pixels[y * W + x];
        if (c) { ctx.fillStyle = c; ctx.fillRect(x * cell, y * cell, cell, cell); }
      }
      if (state.showGrid) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, H * cell); ctx.stroke(); }
        for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(W * cell, y * cell + 0.5); ctx.stroke(); }
      }
    }

    function pushUndo() {
      state.undoStack.push(state.pixels.slice());
      if (state.undoStack.length > 40) state.undoStack.shift();
      state.redoStack.length = 0;
    }
    function undo() {
      if (!state.undoStack.length) return;
      state.redoStack.push(state.pixels.slice());
      state.pixels = state.undoStack.pop();
      render();
    }
    function redo() {
      if (!state.redoStack.length) return;
      state.undoStack.push(state.pixels.slice());
      state.pixels = state.redoStack.pop();
      render();
    }
    function flipHorizontal() {
      pushUndo();
      const flipped = new Array(W * H).fill(null);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) flipped[y * W + (W - 1 - x)] = state.pixels[y * W + x];
      state.pixels = flipped;
      render();
    }

    // Stores a named frame's buffer. If it's the currently active frame,
    // it becomes the live editable canvas immediately; otherwise it's just
    // stashed for later. Used to hand the engine auto-generated poses.
    function setFrame(frameId, pixels) {
      if (frameId === state.activeFrameId) { state.pixels = pixels.slice(); render(); }
      else state.frames[frameId] = pixels.slice();
    }
    // Swaps which frame is live for editing: stashes the current buffer
    // under its own id, then loads the target frame's buffer (or a blank
    // one, if this frame doesn't exist yet) into state.pixels. Starts a
    // fresh undo history per frame rather than a combined one, for now.
    function switchFrame(frameId) {
      if (frameId === state.activeFrameId) return;
      state.frames[state.activeFrameId] = state.pixels.slice();
      const next = state.frames[frameId];
      state.pixels = (next ? next.slice() : new Array(W * H).fill(null));
      delete state.frames[frameId];
      state.activeFrameId = frameId;
      state.undoStack = [];
      state.redoStack = [];
      render();
    }
    // A snapshot of every frame, including the currently active one.
    function allFrames() {
      return { ...state.frames, [state.activeFrameId]: state.pixels.slice() };
    }
    // Restores a full frame set (e.g. from a saved gallery entry).
    function loadFrames(frames, activeFrameId) {
      state.frames = {};
      for (const id of Object.keys(frames)) {
        if (id === activeFrameId) continue;
        state.frames[id] = frames[id].slice();
      }
      state.pixels = (frames[activeFrameId] || new Array(W * H).fill(null)).slice();
      state.activeFrameId = activeFrameId;
      state.undoStack = [];
      state.redoStack = [];
      render();
    }
    // Drops every frame but the active one — used when a fresh
    // generate/reshape/recolour makes any previously-generated poses stale.
    function resetFrames() {
      state.frames = {};
    }

    function setPixel(x, y, val) {
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      state.pixels[y * W + x] = val;
    }
    function floodFill(x0, y0, val) {
      const target = state.pixels[y0 * W + x0];
      if (target === val) return;
      const stack = [[x0, y0]];
      const seen = new Set();
      while (stack.length) {
        const [x, y] = stack.pop();
        const key = x + "," + y;
        if (x < 0 || x >= W || y < 0 || y >= H || seen.has(key)) continue;
        seen.add(key);
        if (state.pixels[y * W + x] !== target) continue;
        state.pixels[y * W + x] = val;
        if (state.symmetry) {
          const mx = (W - 1) - x;
          if (state.pixels[y * W + mx] === target) state.pixels[y * W + mx] = val;
        }
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }

    function applyTool(x, y) {
      if (state.tool === "eyedrop") {
        const c = state.pixels[y * W + x];
        if (c) { state.color = c; syncColorUI(); }
        return;
      }
      if (state.tool === "fill") { floodFill(x, y, state.color); return; }
      const val = state.tool === "erase" ? null : state.color;
      setPixel(x, y, val);
      if (state.symmetry) setPixel((W - 1) - x, y, val);
    }

    let painting = false, lastCell = null;
    function cellFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
      const x = Math.floor(cx / state.cellPx), y = Math.floor(cy / state.cellPx);
      if (x < 0 || x >= W || y < 0 || y >= H) return null;
      return [x, y];
    }
    canvas.addEventListener("pointerdown", (e) => {
      const cell = cellFromEvent(e);
      if (!cell) return;
      canvas.setPointerCapture(e.pointerId);
      pushUndo();
      painting = true;
      lastCell = cell;
      applyTool(cell[0], cell[1]);
      render();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!painting) return;
      const cell = cellFromEvent(e);
      if (!cell) return;
      if (lastCell && cell[0] === lastCell[0] && cell[1] === lastCell[1]) return;
      lastCell = cell;
      if (state.tool === "fill") return;
      applyTool(cell[0], cell[1]);
      render();
    });
    function endStroke() { painting = false; lastCell = null; }
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);

    document.querySelectorAll(".tbtn[data-tool]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.tool = btn.dataset.tool;
        document.querySelectorAll(".tbtn[data-tool]").forEach(b => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      });
    });
    if (buttons.undo) buttons.undo.addEventListener("click", undo);
    if (buttons.redo) buttons.redo.addEventListener("click", redo);
    if (buttons.flip) buttons.flip.addEventListener("click", flipHorizontal);
    if (buttons.clear) buttons.clear.addEventListener("click", () => {
      pushUndo();
      state.pixels = new Array(W * H).fill(null);
      state.lastRecipe = null;
      state.lastColors = null;
      render();
    });
    if (checks.symmetry) checks.symmetry.addEventListener("change", (e) => { state.symmetry = e.target.checked; });
    if (checks.grid) checks.grid.addEventListener("change", (e) => { state.showGrid = e.target.checked; render(); });
    if (zoomRangeEl) zoomRangeEl.addEventListener("input", (e) => { state.cellPx = parseInt(e.target.value, 10); render(); });

    window.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    });

    function renderPalettePreview(cols) {
      if (!palettePreviewEl) return;
      palettePreviewEl.innerHTML = "";
      cols.forEach(c => {
        const chip = document.createElement("span");
        chip.className = "palette-chip";
        chip.style.background = c;
        chip.title = c;
        palettePreviewEl.appendChild(chip);
      });
    }

    function renderSwatches() {
      const theme = paletteSel.value;
      const cols = palettes[theme] || palettes[firstPaletteKey];
      renderPalettePreview(cols);
      swatchesEl.innerHTML = "";
      const addSwatch = (color, isChecker) => {
        const b = document.createElement("button");
        b.className = "swatch" + (isChecker ? " checker" : "");
        if (!isChecker) b.style.background = color;
        b.setAttribute("aria-pressed", (!isChecker && state.color === color) ? "true" : "false");
        b.title = isChecker ? "Eraser" : color;
        b.addEventListener("click", () => {
          if (isChecker) {
            state.tool = "erase";
            document.querySelectorAll(".tbtn[data-tool]").forEach(bb => bb.setAttribute("aria-pressed", bb.dataset.tool === "erase" ? "true" : "false"));
          } else {
            state.color = color;
            if (state.tool === "erase") state.tool = "pencil";
            document.querySelectorAll(".tbtn[data-tool]").forEach(bb => bb.setAttribute("aria-pressed", bb.dataset.tool === state.tool ? "true" : "false"));
          }
          syncColorUI();
        });
        swatchesEl.appendChild(b);
      };
      cols.forEach(c => addSwatch(c, false));
      addSwatch(DARK, false);
      addSwatch(WHITE, false);
      addSwatch(null, true);

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = state.color;
      colorInput.title = "Custom colour";
      colorInput.addEventListener("input", (e) => { state.color = e.target.value; syncColorUI(); });
      swatchesEl.appendChild(colorInput);
    }
    function syncColorUI() {
      swatchesEl.querySelectorAll(".swatch:not(.checker)").forEach(b => {
        b.setAttribute("aria-pressed", b.style.background && sameColor(b.style.background, state.color) ? "true" : "false");
      });
    }
    function sameColor(a, b) {
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = a; const na = c.fillStyle;
      c.fillStyle = b; const nb = c.fillStyle;
      return na === nb;
    }
    paletteSel.addEventListener("change", renderSwatches);

    function randomColors(themeKey) { return shuffled(palettes[themeKey] || palettes[firstPaletteKey]); }
    function randomPresetKey() { const keys = Object.keys(presetLabels); return keys[Math.floor(Math.random() * keys.length)]; }

    if (presetSel) {
      const randOpt = document.createElement("option");
      randOpt.value = "random"; randOpt.textContent = "🎲 Random";
      presetSel.appendChild(randOpt);
      Object.keys(presetLabels).forEach(key => {
        const opt = document.createElement("option");
        opt.value = key; opt.textContent = presetLabels[key] || key;
        presetSel.appendChild(opt);
      });
      if (defaultPresetKey) presetSel.value = defaultPresetKey;
    }
    function currentPresetKey() {
      if (!presetSel) return randomPresetKey();
      return presetSel.value === "random" ? randomPresetKey() : presetSel.value;
    }

    function doGenerate() {
      pushUndo();
      const key = currentPresetKey();
      state.lastPreset = key;
      state.lastRecipe = makeRecipe(key);
      state.lastColors = randomColors(paletteSel.value);
      state.pixels = buildGrid(state.lastRecipe, state.lastColors);
      state.activeFrameId = "front";
      resetFrames();
      render();
    }
    function doReshape() {
      if (!state.lastRecipe) return doGenerate();
      pushUndo();
      const key = currentPresetKey();
      state.lastPreset = key;
      state.lastRecipe = makeRecipe(key);
      if (!state.lastColors) state.lastColors = randomColors(paletteSel.value);
      state.pixels = buildGrid(state.lastRecipe, state.lastColors);
      state.activeFrameId = "front";
      resetFrames();
      render();
    }
    function doRecolor() {
      if (!state.lastRecipe) return doGenerate();
      pushUndo();
      state.lastColors = randomColors(paletteSel.value);
      state.pixels = buildGrid(state.lastRecipe, state.lastColors);
      state.activeFrameId = "front";
      resetFrames();
      render();
    }
    if (buttons.generate) buttons.generate.addEventListener("click", doGenerate);
    if (buttons.reshape) buttons.reshape.addEventListener("click", doReshape);
    if (buttons.recolor) buttons.recolor.addEventListener("click", doRecolor);

    function thumbDataURL(pixels) {
      const scale = 3;
      const off = document.createElement("canvas");
      off.width = W * scale; off.height = H * scale;
      const octx = off.getContext("2d");
      octx.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = pixels[y * W + x];
        if (c) { octx.fillStyle = c; octx.fillRect(x * scale, y * scale, scale, scale); }
      }
      return off.toDataURL("image/png");
    }
    function persistGallery() {
      try { localStorage.setItem(galleryKey, JSON.stringify(state.gallery.slice(0, 24))); }
      catch (e) { /* private mode or full — ignore, gallery just won't persist */ }
    }
    function loadGallery() {
      try {
        const raw = localStorage.getItem(galleryKey);
        if (raw) state.gallery = JSON.parse(raw) || [];
      } catch (e) { state.gallery = []; }
    }
    function renderGallery() {
      if (!galleryStripEl) return;
      galleryStripEl.innerHTML = "";
      if (!state.gallery.length) {
        const p = document.createElement("span");
        p.className = "empty-note";
        p.textContent = "Saved sprites appear here.";
        galleryStripEl.appendChild(p);
        return;
      }
      state.gallery.forEach(entry => {
        const wrap = document.createElement("div");
        wrap.className = "gallery-item";
        const b = document.createElement("button");
        b.className = "thumb";
        const img = document.createElement("img");
        img.src = entry.thumb;
        img.alt = "Saved sprite";
        b.appendChild(img);
        b.addEventListener("click", () => {
          const frames = entry.frames
            ? { ...entry.frames, [entry.activeFrameId || "front"]: entry.pixels }
            : { front: entry.pixels };
          loadFrames(frames, entry.activeFrameId || "front");
          state.lastRecipe = entry.recipe || null;
          state.lastColors = entry.colors || null;
          showToast("Loaded from gallery.");
        });
        const del = document.createElement("button");
        del.className = "del";
        del.textContent = "×";
        del.title = "Delete";
        del.addEventListener("click", (ev) => {
          ev.stopPropagation();
          state.gallery = state.gallery.filter(g => g.id !== entry.id);
          persistGallery();
          renderGallery();
        });
        wrap.appendChild(b);
        wrap.appendChild(del);
        galleryStripEl.appendChild(wrap);
      });
    }
    function addGalleryEntry(frames, thumbFrameId) {
      const entry = {
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        pixels: state.pixels.slice(), thumb: thumbDataURL(frames[thumbFrameId] || state.pixels),
        recipe: state.lastRecipe, colors: state.lastColors,
        frames, activeFrameId: state.activeFrameId in frames ? state.activeFrameId : thumbFrameId,
      };
      state.gallery.unshift(entry);
      persistGallery();
      renderGallery();
    }
    // saves ONLY the frame you're currently looking at, as its own
    // standalone single-pose entry — independent of any other poses
    if (buttons.save) buttons.save.addEventListener("click", () => {
      addGalleryEntry({ [state.activeFrameId]: state.pixels.slice() }, state.activeFrameId);
      showToast("Saved pose to gallery.");
    });
    // bundles every generated/edited frame into one entry
    if (buttons.saveSheet) buttons.saveSheet.addEventListener("click", () => {
      const frames = allFrames();
      const frameCount = Object.keys(frames).length;
      if (frameCount <= 1) { showToast("Generate poses first to save a full sprite sheet."); return; }
      addGalleryEntry(frames, "front");
      showToast(`Saved sprite sheet (${frameCount} frames) to gallery.`);
    });

    function buildSheetCanvas(entries, cell = 16, gap = 2) {
      const cols = Math.min(6, entries.length);
      const rows = Math.ceil(entries.length / cols);
      const cw = W * cell, ch = H * cell;
      const sheet = document.createElement("canvas");
      sheet.width = cols * cw + (cols + 1) * gap;
      sheet.height = rows * ch + (rows + 1) * gap;
      const sctx = sheet.getContext("2d");
      sctx.imageSmoothingEnabled = false;
      entries.forEach((entry, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const ox = gap + col * (cw + gap), oy = gap + row * (ch + gap);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const c = entry.pixels[y * W + x];
          if (c) { sctx.fillStyle = c; sctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
        }
      });
      return sheet;
    }
    if (buttons.sheet) buttons.sheet.addEventListener("click", () => {
      if (!state.gallery.length) { showToast("Save a few sprites to the gallery first."); return; }
      const sheet = buildSheetCanvas(state.gallery);
      downloadCanvas(sheet, `${filenamePrefix}-sheet.png`);
      showToast(`Exported ${state.gallery.length} sprite${state.gallery.length === 1 ? "" : "s"} as one sheet.`);
    });

    if (buttons.download) buttons.download.addEventListener("click", () => {
      const off = document.createElement("canvas");
      off.width = W * exportCell; off.height = H * exportCell;
      const octx = off.getContext("2d");
      octx.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = state.pixels[y * W + x];
        if (c) { octx.fillStyle = c; octx.fillRect(x * exportCell, y * exportCell, exportCell, exportCell); }
      }
      off.toBlob((blob) => {
        if (!blob) { showToast("Could not build the image."); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filenamePrefix}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        showToast("Downloaded.");
      }, "image/png");
    });

    function boot() {
      renderSwatches();
      loadGallery();
      renderGallery();
      doGenerate();
    }

    return { state, render, pushUndo, undo, redo, doGenerate, doReshape, doRecolor, boot, showToast,
             setFrame, switchFrame, allFrames, loadFrames, resetFrames };
  }

  window.SpriteTool = window.SpriteTool || {};
  window.SpriteTool.DARK = DARK;
  window.SpriteTool.WHITE = WHITE;
  window.SpriteTool.shuffled = shuffled;
  window.SpriteTool.pickNoiseRuns = pickNoiseRuns;
  window.SpriteTool.outlinePass = outlinePass;
  window.SpriteTool.downloadCanvas = downloadCanvas;
  window.SpriteTool.createEditor = createEditor;
})();
