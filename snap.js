// Snap to Style page: each dropped image goes through Pixel Snapper (grid +
// colours, WebAssembly) and then SnapCore.stylePass (background, height,
// palette lock). The originals stay in memory, so changing a setting and
// pressing "Process again" re-runs everything without re-dropping files.
// An ES module because the Pixel Snapper build is one; it needs the page
// served over http(s) (GitHub Pages, or `python3 -m http.server` locally).
import initSnapper, { process_image } from "./vendor/pixel-snapper/spritefusion_pixel_snapper.js";

const SnapCore = window.SnapCore;
const $ = (id) => document.getElementById(id);
const items = []; // { name, bytes, srcUrl, snapped, styled }
const PREFS_KEY = "spriteForge.snap.v1";
const CUSTOM_TILES_KEY = "spriteForge.customTiles.v1"; // read by tiles.js

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ---- settings ---------------------------------------------------------------
const parseHexList = (s) => (s.match(/#?[0-9a-fA-F]{6}\b/g) || []).map(h => "#" + h.replace("#", "").toUpperCase());

function readStyle() {
  const num = (id) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) && v > 0 ? v : null; };
  return {
    mode: $("modeSel").value,
    tileSize: parseInt($("tileSizeSel").value, 10),
    colors: num("colorsIn") || 16,
    pixelSize: num("pixelIn"),
    height: num("heightIn"),
    removeBackground: $("bgChk").checked,
    palette: parseHexList($("paletteIn").value),
    accents: parseHexList($("accentIn").value),
  };
}
function applyStyle(s) {
  if (s.mode) $("modeSel").value = s.mode;
  if (s.tileSize) $("tileSizeSel").value = String(s.tileSize);
  syncMode();
  $("colorsIn").value = s.colors || 16;
  $("pixelIn").value = s.pixelSize || "";
  $("heightIn").value = s.height || "";
  $("bgChk").checked = s.removeBackground !== false;
  $("paletteIn").value = (s.palette || []).join(", ");
  $("accentIn").value = (s.accents || []).join(", ");
  renderPalettePreview();
}
function syncMode() {
  const tile = $("modeSel").value === "tile";
  $("spriteOpts").hidden = tile; $("accentOpts").hidden = tile; $("tileOpts").hidden = !tile;
  $("sheetBtn").hidden = tile;
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ preset: $("presetSel").value, style: readStyle() })); } catch (e) { /* private mode */ }
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "null"); } catch (e) { return null; }
}

function renderPalettePreview() {
  const s = readStyle(), el = $("palettePreview");
  el.innerHTML = "";
  if (!s.palette.length && !s.accents.length) return;
  for (const c of SnapCore.buildRamps(s.palette.concat(s.accents), 1)) {
    const chip = document.createElement("span");
    chip.className = "palette-chip";
    chip.style.background = c.hex;
    chip.title = c.hex === c.base ? c.hex : `${c.hex} (ramp of ${c.base})`;
    el.appendChild(chip);
  }
}

async function loadPreset(id) {
  if (!id) { applyStyle({ colors: 16 }); return; }
  const res = await fetch(`presets/${id}.json`);
  applyStyle(await res.json());
}

// ---- processing ---------------------------------------------------------------
async function decode(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext("2d");
  ctx.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
}

async function processItem(item, style) {
  // the palette lock happens in our pass (with ramps), not in Pixel Snapper,
  // whose palette option is a plain nearest-colour map
  const out = process_image(item.bytes, style.colors, style.pixelSize, null);
  item.snapped = await decode(out);
  item.mode = style.mode;
  if (style.mode === "tile") {
    item.styled = SnapCore.tilePass(item.snapped, { size: style.tileSize, palette: style.palette });
    return;
  }
  item.styled = SnapCore.stylePass(item.snapped, {
    removeBackground: style.removeBackground,
    height: style.height,
    palette: style.palette,
    accents: style.accents,
  });
}

function toCanvas(img, scale = 1) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, img.w * scale); c.height = Math.max(1, img.h * scale);
  if (!img.w) return c;
  const src = document.createElement("canvas");
  src.width = img.w; src.height = img.h;
  src.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function downloadImg(img, filename) {
  toCanvas(img).toBlob((b) => downloadBlob(b, filename), "image/png");
}
function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const baseName = (n) => n.replace(/\.[^.]+$/, "");

function renderResults() {
  const box = $("results");
  box.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "snap-row";
    const fig = (label, node) => {
      const f = document.createElement("figure");
      f.appendChild(node);
      const cap = document.createElement("figcaption"); cap.textContent = label;
      f.appendChild(cap);
      return f;
    };
    const orig = new Image(); orig.src = item.srcUrl;
    row.appendChild(fig("render", orig));
    if (item.snapped) {
      const fit = (img) => Math.max(1, Math.floor(160 / Math.max(img.w, img.h, 1)));
      row.appendChild(fig(`snapped ${item.snapped.w}×${item.snapped.h}`, toCanvas(item.snapped, fit(item.snapped))));
      row.appendChild(fig(`styled ${item.styled.w}×${item.styled.h}`, toCanvas(item.styled, fit(item.styled))));
      if (item.mode === "tile") row.appendChild(fig("repeated 3×3", repeatCanvas(item.styled, 3, Math.max(1, Math.floor(160 / (item.styled.w * 3))))));
      if (item.mode === "tile") {
        const tb = document.createElement("button");
        tb.className = "primary"; tb.textContent = "▦ Make a tileset";
        tb.addEventListener("click", () => sendToTiles(item));
        row.appendChild(tb);
      }
      const dl = document.createElement("button");
      dl.className = "secondary"; dl.textContent = "⭳ PNG";
      dl.addEventListener("click", () => downloadImg(item.styled, `${baseName(item.name)}.png`));
      row.appendChild(dl);
    } else {
      const p = document.createElement("span"); p.className = "empty-note"; p.textContent = item.error || "processing…";
      row.appendChild(p);
    }
    box.appendChild(row);
  }
  $("sheetBtn").disabled = !items.some(i => i.styled);
  $("rerunBtn").disabled = !items.length;
}

async function runAll() {
  const style = readStyle();
  savePrefs();
  for (const item of items) { item.snapped = item.styled = null; item.error = null; }
  renderResults();
  for (const item of items) {
    try { await processItem(item, style); } catch (e) { item.error = `failed: ${e.message || e}`; }
    renderResults();
  }
}

async function addFiles(files) {
  for (const f of files) {
    if (!/image\/(png|jpeg)/.test(f.type)) continue;
    items.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), srcUrl: URL.createObjectURL(f) });
  }
  await runAll();
}

// the tile laid out n x n, to show it repeats without a seam
function repeatCanvas(img, n, scale) {
  const one = toCanvas(img), c = document.createElement("canvas");
  c.width = img.w * n * scale; c.height = img.h * n * scale;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) ctx.drawImage(one, x * img.w * scale, y * img.h * scale, img.w * scale, img.h * scale);
  return c;
}

// Hand the tile to the Tiles tool: kept in this browser's storage (newest
// first, up to 12), then open Tiles on it.
function sendToTiles(item) {
  const id = `custom-${Date.now().toString(36)}`;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(CUSTOM_TILES_KEY) || "[]"); } catch (e) { /* unreadable: start over */ }
  let bin = "";
  item.styled.data.forEach((v) => { bin += String.fromCharCode(v); });
  list.unshift({ id, name: baseName(item.name), size: item.styled.w, rgba: btoa(bin) });
  try {
    localStorage.setItem(CUSTOM_TILES_KEY, JSON.stringify(list.slice(0, 12)));
  } catch (e) { toast("Couldn't save it in this browser (private mode?)."); return; }
  location.href = `tiles.html#material=${id}`;
}

function exportSheet() {
  const done = items.filter(i => i.styled && i.styled.w);
  const { sheet, frames, cell } = SnapCore.packSheet(done.map(i => ({ name: baseName(i.name), img: i.styled })));
  downloadImg(sheet, "sheet.png");
  const json = JSON.stringify({ image: "sheet.png", cell, frames }, null, 2);
  downloadBlob(new Blob([json], { type: "application/json" }), "sheet.json");
}

// ---- boot -------------------------------------------------------------------------
async function boot() {
  await initSnapper();
  const prefs = loadPrefs();
  if (prefs) { $("presetSel").value = prefs.preset || ""; applyStyle(prefs.style || {}); }
  else await loadPreset($("presetSel").value);

  $("presetSel").addEventListener("change", async () => {
    const mode = $("modeSel").value, tileSize = $("tileSizeSel").value;
    await loadPreset($("presetSel").value);
    $("modeSel").value = mode; $("tileSizeSel").value = tileSize; syncMode(); // a preset is a style, not a mode
    savePrefs();
  });
  $("modeSel").addEventListener("change", () => { syncMode(); if (items.length) runAll(); else savePrefs(); });
  $("tileSizeSel").addEventListener("change", () => { if (items.length) runAll(); else savePrefs(); });
  for (const id of ["paletteIn", "accentIn"]) $(id).addEventListener("input", renderPalettePreview);
  $("rerunBtn").addEventListener("click", runAll);
  $("sheetBtn").addEventListener("click", exportSheet);
  $("pickBtn").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", (e) => addFiles([...e.target.files]));
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); });
  renderResults();
}
boot().catch((e) => toast(`Couldn't start: ${e.message || e}`));
