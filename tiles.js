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
  const CUSTOM_TILES_KEY = "spriteForge.customTiles.v1"; // written by Snap to Style's tile mode

  // Texture tiles sent over from Snap to Style become materials in a
  // "Custom" group at the top of the library.
  function loadCustomMaterials() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(CUSTOM_TILES_KEY) || "[]"); } catch (e) { return; }
    for (const t of list) {
      try {
        const bin = atob(t.rgba), data = new Uint8ClampedArray(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
        Tiles.MATERIALS[t.id] = Tiles.materialFromImage({ w: t.size, h: t.size, data }, t.name);
      } catch (e) { /* skip a damaged entry */ }
    }
    if (list.length && !Tiles.GROUPS.includes("Custom")) Tiles.GROUPS.unshift("Custom");
  }

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

  // ---- library -------------------------------------------------------------------
  // One button per material, grouped, each showing a small ledge painted with
  // that material's own tileset. Thumbnails render one per tick so the page
  // stays responsive while they fill in.
  const THUMB_MAP = [
    "........",
    "..###...",
    ".######.",
    ".##..##.",
    "........",
  ].map(r => [...r].map(ch => ch === "#"));

  function buildLibrary() {
    const box = $("library"), queue = [];
    for (const group of Tiles.GROUPS) {
      const h = document.createElement("h3");
      h.className = "lib-group"; h.textContent = group;
      box.appendChild(h);
      const row = document.createElement("div");
      row.className = "lib-row";
      box.appendChild(row);
      for (const [key, m] of Object.entries(Tiles.MATERIALS)) {
        if (m.group !== group) continue;
        const b = document.createElement("button");
        b.className = "lib-item"; b.dataset.material = key;
        b.setAttribute("aria-pressed", String(key === state.material));
        const c = document.createElement("canvas");
        c.width = THUMB_MAP[0].length * 16; c.height = THUMB_MAP.length * 16;
        const label = document.createElement("span"); label.textContent = m.label;
        b.append(c, label);
        b.addEventListener("click", () => pick(key));
        row.appendChild(b);
        queue.push([key, c]);
      }
    }
    const next = () => {
      const job = queue.shift();
      if (!job) return;
      const [key, c] = job, ts = Tiles.buildTileset(key, 16, 7);
      const idx = Tiles.autotile(THUMB_MAP, ts.tiles, 7, Infinity), sheet = imgToCanvas(ts.sheet);
      const ctx = c.getContext("2d");
      idx.forEach((row, y) => row.forEach((i, x) => {
        if (i >= 0) ctx.drawImage(sheet, (i % ts.columns) * 16, Math.floor(i / ts.columns) * 16, 16, 16, x * 16, y * 16, 16, 16);
      }));
      setTimeout(next, 0);
    };
    next();
  }
  function pick(key) {
    state.material = key;
    for (const b of document.querySelectorAll(".lib-item")) b.setAttribute("aria-pressed", String(b.dataset.material === key));
    $("pickedName").textContent = Tiles.MATERIALS[key].label;
    build();
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
    loadCustomMaterials();
    const p = loadPrefs();
    if (p) Object.assign(state, { material: p.material in Tiles.MATERIALS ? p.material : "stone", size: p.size || 16, style: p.style || "", seed: p.seed || 1, zoom: p.zoom || 2 });
    else state.seed = newSeed();
    state.mapSeed = newSeed();
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("material");
    if (fromHash && fromHash in Tiles.MATERIALS) state.material = fromHash;
    if (!(state.material in Tiles.MATERIALS)) state.material = "stone";
    $("sizeSel").value = String(state.size);
    $("styleSel").value = state.style; $("zoomRange").value = String(state.zoom);
    state.preset = await loadPreset(state.style).catch(() => null);

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
    buildLibrary();
    pick(state.material);
  }
  boot();
})();
