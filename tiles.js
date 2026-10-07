// Tileset page wiring: material + size + seed in, a 47-join tileset out,
// shown both as the sheet and painted onto a random cave map (so you can
// see the joins work before you export). Palette presets reuse Snap to
// Style's lock (SnapCore.lockPalette) on the finished sheet.
(() => {
  "use strict";
  const { tiles: Tiles, downloadCanvas } = window.SpriteTool;
  const SnapCore = window.SnapCore;
  const $ = (id) => document.getElementById(id);
  const PREFS_KEY = "spriteForge.tiles.v1";

  const state = { material: "stone", size: 16, style: "", seed: 1, mapSeed: 1, zoom: 2, tileset: null, preset: null };

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 2400);
  }
  const newSeed = () => Math.floor(Math.random() * 1e9);

  function imgToCanvas(img, scale = 1) {
    const src = document.createElement("canvas");
    src.width = img.w; src.height = img.h;
    src.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
    if (scale === 1) return src;
    const c = document.createElement("canvas");
    c.width = img.w * scale; c.height = img.h * scale;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  async function loadPreset(id) {
    if (!id) return null;
    const res = await fetch(`presets/${id}.json`);
    return res.json();
  }

  function build() {
    const ts = Tiles.buildTileset(state.material, state.size, state.seed);
    if (state.preset && state.preset.palette) {
      ts.sheet = SnapCore.lockPalette(ts.sheet, state.preset.palette, { steps: state.preset.rampSteps ?? 1 });
    }
    state.tileset = ts;
    $("seedDisplay").textContent = String(state.seed);
    drawSheet(); drawMap(); savePrefs();
  }

  function drawSheet() {
    const { sheet } = state.tileset, c = $("sheetCanvas"), z = state.zoom * 2;
    c.width = sheet.w * z; c.height = sheet.h * z;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imgToCanvas(sheet), 0, 0, c.width, c.height);
  }

  function drawMap() {
    const ts = state.tileset, T = ts.tileSize, cols = ts.columns;
    const mw = Math.round(480 / T), mh = Math.round(256 / T);
    const grid = Tiles.caveMap(mw, mh, state.mapSeed);
    const idx = Tiles.autotile(grid, ts.tiles, state.mapSeed);
    const sheet = imgToCanvas(ts.sheet), c = $("mapCanvas"), z = state.zoom;
    c.width = mw * T * z; c.height = mh * T * z;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg") || "#0b0912";
    ctx.fillRect(0, 0, c.width, c.height);
    idx.forEach((row, y) => row.forEach((i, x) => {
      if (i < 0) return;
      ctx.drawImage(sheet, (i % cols) * T, Math.floor(i / cols) * T, T, T, x * T * z, y * T * z, T * z, T * z);
    }));
  }

  // ---- export -------------------------------------------------------------------
  const baseName = () => `${state.material}_${state.size}${state.style ? "_" + state.style : ""}`;
  function downloadText(text, filename, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const png = () => `${baseName()}.png`;
  function exportPng() { downloadCanvas(imgToCanvas(state.tileset.sheet), png()); }
  function exportGodot() {
    const mat = Tiles.MATERIALS[state.material];
    exportPng();
    downloadText(Tiles.godotTileSet(state.tileset, png(), mat.label, mat.colors.mid), `${baseName()}.tres`, "text/plain");
    toast("Saved the PNG and the .tres — keep them in the same folder.");
  }
  function exportTiled() {
    exportPng();
    downloadText(Tiles.tiledTsx(state.tileset, png(), Tiles.MATERIALS[state.material].label), `${baseName()}.tsx`, "application/xml");
  }
  function exportJson() {
    downloadText(Tiles.tilesetJson(state.tileset, png(), state.material), `${baseName()}.json`, "application/json");
  }

  // ---- prefs -----------------------------------------------------------------------
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ material: state.material, size: state.size, style: state.style, seed: state.seed, zoom: state.zoom }));
    } catch (e) { /* private mode */ }
  }
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "null"); } catch (e) { return null; }
  }

  async function boot() {
    for (const [key, m] of Object.entries(Tiles.MATERIALS)) {
      const o = document.createElement("option");
      o.value = key; o.textContent = m.label;
      $("materialSel").appendChild(o);
    }
    const p = loadPrefs();
    if (p) Object.assign(state, { material: p.material in Tiles.MATERIALS ? p.material : "stone", size: p.size || 16, style: p.style || "", seed: p.seed || 1, zoom: p.zoom || 2 });
    else state.seed = newSeed();
    state.mapSeed = newSeed();
    $("materialSel").value = state.material; $("sizeSel").value = String(state.size);
    $("styleSel").value = state.style; $("zoomRange").value = String(state.zoom);
    state.preset = await loadPreset(state.style).catch(() => null);

    $("materialSel").addEventListener("change", (e) => { state.material = e.target.value; build(); });
    $("sizeSel").addEventListener("change", (e) => { state.size = parseInt(e.target.value, 10); build(); });
    $("styleSel").addEventListener("change", async (e) => {
      state.style = e.target.value;
      try { state.preset = await loadPreset(state.style); } catch (err) { state.preset = null; toast("Couldn't load that style (open the page over http)."); }
      build();
    });
    $("rerollBtn").addEventListener("click", () => { state.seed = newSeed(); build(); });
    $("newMapBtn").addEventListener("click", () => { state.mapSeed = newSeed(); drawMap(); });
    $("zoomRange").addEventListener("input", (e) => { state.zoom = parseInt(e.target.value, 10); drawSheet(); drawMap(); savePrefs(); });
    $("pngBtn").addEventListener("click", exportPng);
    $("godotBtn").addEventListener("click", exportGodot);
    $("tiledBtn").addEventListener("click", exportTiled);
    $("jsonBtn").addEventListener("click", exportJson);
    build();
  }
  boot();
})();
