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
// "#RRGGBB" tokens separated by commas/spaces; anything else is reported,
// not guessed at (a bare word like "decade" is valid hex but not a colour
// anyone meant)
function parseHexList(text) {
  const ok = [], bad = [];
  for (const t of text.split(/[\s,;]+/).filter(Boolean)) {
    if (/^#[0-9a-fA-F]{6}$/.test(t)) ok.push(t.toUpperCase()); else bad.push(t);
  }
  return { ok, bad };
}
// keys a preset file can carry beyond the form fields (see presets/*.json)
let presetExtras = {};

function readStyle() {
  const num = (id) => { const v = parseInt($(id).value, 10); return Number.isFinite(v) && v > 0 ? v : null; };
  return {
    mode: $("modeSel").value,
    tileSize: parseInt($("tileSizeSel").value, 10),
    colors: num("colorsIn") || 16,
    pixelSize: num("pixelIn"),
    height: num("heightIn"),
    removeBackground: $("bgChk").checked,
    palette: parseHexList($("paletteIn").value).ok,
    accents: parseHexList($("accentIn").value).ok,
    extras: presetExtras,
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
  presetExtras = s.extras || { rampSteps: s.rampSteps, bgTolerance: s.bgTolerance, shadowRows: s.shadowRows };
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
  const bad = [...parseHexList($("paletteIn").value).bad, ...parseHexList($("accentIn").value).bad];
  if (bad.length) {
    const note = document.createElement("span");
    note.className = "palette-bad";
    note.textContent = `Ignored (not #RRGGBB): ${bad.slice(0, 4).join(" ")}${bad.length > 4 ? " …" : ""}`;
    el.appendChild(note);
  }
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
  if (!res.ok) throw new Error(`preset ${id}: ${res.status}`);
  applyStyle(await res.json());
}

// ---- processing ---------------------------------------------------------------
async function decode(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext("2d");
  ctx.drawImage(bmp, 0, 0);
  return { w: bmp.width, h: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
}

// What Pixel Snapper gets: the file itself when it's a PNG/JPEG of a sane
// size, otherwise the image re-encoded as PNG — which is how WebP/GIF/BMP
// renders get in, and how huge images are brought down to MAX_SIDE first.
const MAX_SIDE = 2048;
async function inputBytes(file) {
  const bmp = await createImageBitmap(file); // throws for anything that isn't an image
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (k === 1 && /^image\/(png|jpeg)$/.test(file.type)) return { bytes: new Uint8Array(await file.arrayBuffer()), scaled: false };
  const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return { bytes: new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()), scaled: k < 1 };
}

function processItem(item, style) {
  // the palette lock happens in our pass (with ramps), not in Pixel Snapper,
  // whose palette option is a plain nearest-colour map
  const out = process_image(item.bytes, style.colors, style.pixelSize, null);
  return decode(out).then((snapped) => {
    const extra = style.extras || {};
    const styled = style.mode === "tile"
      ? SnapCore.tilePass(snapped, { size: style.tileSize, palette: style.palette, rampSteps: extra.rampSteps })
      : SnapCore.stylePass(snapped, {
          removeBackground: style.removeBackground, height: style.height,
          palette: style.palette, accents: style.accents,
          rampSteps: extra.rampSteps, bgTolerance: extra.bgTolerance, shadowRows: extra.shadowRows,
        });
    return { snapped, styled };
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
const pngBlob = (img) => new Promise((ok) => toCanvas(img).toBlob(ok, "image/png"));
function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Several files from one click: one after another with a short gap (browsers
// can drop downloads fired in the same instant). Chrome still asks once per
// site whether to allow multiple downloads.
async function downloadAll(files) {
  for (const [i, [blobOrPromise, name]] of files.entries()) {
    if (i) await new Promise((ok) => setTimeout(ok, 300));
    downloadBlob(await blobOrPromise, name);
  }
}
const baseName = (n) => n.replace(/\.[^.]+$/, "") || "sprite";

// ---- results ----------------------------------------------------------------------
// One row per item, updated in place: dropping more files or finishing one
// image never rebuilds the others.
function renderRow(item) {
  const row = document.createElement("div");
  row.className = "snap-row";
  const fig = (label, node) => {
    const f = document.createElement("figure");
    f.appendChild(node);
    const cap = document.createElement("figcaption"); cap.textContent = label;
    f.appendChild(cap);
    return f;
  };
  const orig = new Image(); orig.src = item.srcUrl; orig.alt = item.name;
  row.appendChild(fig(item.scaled ? "render (scaled down)" : "render", orig));
  if (item.styled) {
    const fit = (img) => Math.max(1, Math.floor(160 / Math.max(img.w, img.h, 1)));
    row.appendChild(fig(`snapped ${item.snapped.w}×${item.snapped.h}`, toCanvas(item.snapped, fit(item.snapped))));
    if (!item.styled.w) {
      const p = document.createElement("span"); p.className = "empty-note";
      p.textContent = "nothing left after background removal — try Process again with it off";
      row.appendChild(p);
    } else {
      row.appendChild(fig(`styled ${item.styled.w}×${item.styled.h}`, toCanvas(item.styled, fit(item.styled))));
      if (item.mode === "tile") {
        row.appendChild(fig("repeated 3×3", repeatCanvas(item.styled, 3, Math.max(1, Math.floor(160 / (item.styled.w * 3))))));
        const tb = document.createElement("button");
        tb.className = "primary"; tb.textContent = "▦ Make a tileset";
        tb.addEventListener("click", () => sendToTiles(item));
        row.appendChild(tb);
      }
      const dl = document.createElement("button");
      dl.className = "secondary"; dl.textContent = "⭳ PNG";
      dl.addEventListener("click", async () => downloadBlob(await pngBlob(item.styled), `${baseName(item.name)}.png`));
      row.appendChild(dl);
    }
  } else {
    const p = document.createElement("span"); p.className = "empty-note"; p.textContent = item.error || "processing…";
    row.appendChild(p);
  }
  const rm = document.createElement("button");
  rm.className = "snap-remove"; rm.textContent = "✕";
  rm.title = rm.ariaLabel = `Remove ${item.name}`;
  rm.addEventListener("click", () => removeItem(item));
  row.appendChild(rm);
  if (item.row) item.row.replaceWith(row); else $("results").appendChild(row);
  item.row = row;
  syncButtons();
}
function syncButtons() {
  const sprites = items.filter(i => i.styled && i.styled.w && i.mode === "sprite");
  $("sheetBtn").disabled = !sprites.length;
  $("rerunBtn").disabled = !items.length;
  $("clearBtn").hidden = !items.length;
}
function removeItem(item) {
  items.splice(items.indexOf(item), 1);
  URL.revokeObjectURL(item.srcUrl);
  if (item.row) item.row.remove();
  syncButtons();
}

// Runs are numbered: a newer run (a setting changed, Process again) makes
// any older loop stop at its next item instead of writing stale results.
let runId = 0;
async function processQueue(list, style, id) {
  for (const item of list) {
    if (id !== runId) return;
    await new Promise((ok) => setTimeout(ok, 0)); // let the page paint between images
    if (!items.includes(item)) continue;           // removed while waiting
    try {
      const r = await processItem(item, style);
      if (id !== runId) return;
      Object.assign(item, r, { mode: style.mode, error: null });
    } catch (e) {
      if (id !== runId) return;
      Object.assign(item, { snapped: null, styled: null, error: `failed: ${e.message || e}` });
    }
    renderRow(item);
  }
}
function runAll() {
  const style = readStyle(), id = ++runId;
  savePrefs();
  for (const item of items) { item.snapped = item.styled = null; item.error = null; renderRow(item); }
  return processQueue(items.slice(), style, id);
}
async function addFiles(files) {
  const added = [], skipped = [];
  let scaled = 0;
  for (const f of files) {
    try {
      const { bytes, scaled: s } = await inputBytes(f);
      const item = { name: f.name || "image", bytes, srcUrl: URL.createObjectURL(f), scaled: s };
      items.push(item); added.push(item); renderRow(item);
      if (s) scaled++;
    } catch (e) { skipped.push(f.name || "a file"); }
  }
  if (skipped.length) toast(`Skipped ${skipped.length} that ${skipped.length === 1 ? "isn't an image" : "aren't images"}: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}`);
  else if (scaled) toast(`${scaled} large image${scaled > 1 ? "s" : ""} scaled down to ${MAX_SIDE}px first.`);
  await processQueue(added, readStyle(), runId); // only the new ones; earlier results stay
}
function clearAll() {
  runId++;
  for (const item of items.splice(0)) URL.revokeObjectURL(item.srcUrl);
  $("results").innerHTML = "";
  syncButtons();
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
  if (!Array.isArray(list)) list = [];
  let bin = "";
  for (let i = 0; i < item.styled.data.length; i += 0x8000) bin += String.fromCharCode(...item.styled.data.subarray(i, i + 0x8000));
  list.unshift({ id, name: baseName(item.name), size: item.styled.w, rgba: btoa(bin) });
  try {
    localStorage.setItem(CUSTOM_TILES_KEY, JSON.stringify(list.slice(0, 12)));
  } catch (e) { toast("Couldn't save it in this browser (private mode?)."); return; }
  location.href = `tiles.html#material=${id}`;
}

function exportSheet() {
  const done = items.filter(i => i.styled && i.styled.w && i.mode === "sprite");
  if (!done.length) return;
  // frame names are keys: two files called knight.png must not collide
  const seen = new Map();
  const named = done.map((i) => {
    const b = baseName(i.name), n = (seen.get(b) || 0) + 1;
    seen.set(b, n);
    return { name: n === 1 ? b : `${b}_${n}`, img: i.styled };
  });
  const { sheet, frames, cell } = SnapCore.packSheet(named);
  const json = JSON.stringify({ image: "sheet.png", cell, frames }, null, 2);
  downloadAll([[pngBlob(sheet), "sheet.png"], [new Blob([json], { type: "application/json" }), "sheet.json"]]);
}

// ---- boot -------------------------------------------------------------------------
function fatal(msg) {
  const b = $("fatal");
  b.textContent = msg; b.hidden = false;
}
async function boot() {
  await initSnapper();
  const prefs = loadPrefs();
  if (prefs) { $("presetSel").value = prefs.preset || ""; applyStyle(prefs.style || {}); }
  else await loadPreset($("presetSel").value).catch(() => { $("presetSel").value = ""; applyStyle({ colors: 16 }); });

  $("presetSel").addEventListener("change", async () => {
    const mode = $("modeSel").value, tileSize = $("tileSizeSel").value;
    try { await loadPreset($("presetSel").value); }
    catch (e) { toast("Couldn't load that preset."); $("presetSel").value = ""; }
    $("modeSel").value = mode; $("tileSizeSel").value = tileSize; syncMode(); // a preset is a style, not a mode
    savePrefs();
  });
  $("modeSel").addEventListener("change", () => { syncMode(); if (items.length) runAll(); else savePrefs(); });
  $("tileSizeSel").addEventListener("change", () => { if (items.length) runAll(); else savePrefs(); });
  for (const id of ["paletteIn", "accentIn"]) $(id).addEventListener("input", renderPalettePreview);
  // every field is remembered as you type, not only when a run starts
  for (const id of ["colorsIn", "pixelIn", "heightIn", "bgChk", "paletteIn", "accentIn"]) $(id).addEventListener("change", savePrefs);
  $("rerunBtn").addEventListener("click", runAll);
  $("sheetBtn").addEventListener("click", exportSheet);
  $("clearBtn").addEventListener("click", clearAll);
  $("pickBtn").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
  // files can land anywhere on the page — without this, a drop that misses
  // the box opens the image in the tab and every result is lost
  const drop = $("drop");
  window.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) drop.classList.remove("over"); });
  window.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  syncButtons();
}
boot().catch((e) => fatal(`Snap to Style couldn't start (${e.message || e}). It needs a recent browser and the page served over http(s).`));
