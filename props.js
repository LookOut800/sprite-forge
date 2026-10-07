// Props page wiring: the shared editor engine with the prop generator, plus
// a strip of 12 variations (12 seeds of the current kind + palette) to pick
// from — clicking one loads that exact seed into the editor, so it's the
// same prop the share link and gallery will reproduce.
(() => {
  "use strict";
  const { createEditor, withSeededRandom } = window.SpriteTool;
  const { W, H, PRESET_LABELS, PALETTES, makeRecipe, buildGrid } = window.SpriteTool.props;
  const $ = (id) => document.getElementById(id);

  const editor = createEditor({
    W, H,
    canvas: $("pixels"),
    toastEl: $("toast"),
    swatchesEl: $("swatches"),
    galleryStripEl: $("galleryStrip"),
    palettePreviewEl: $("palettePreview"),
    seedDisplayEl: $("seedDisplay"),
    presetSel: $("presetSel"),
    paletteSel: $("paletteSel"),
    buttons: {
      generate: $("generateBtn"),
      copyLink: $("copyLinkBtn"),
      save: $("saveBtn"),
      sheet: $("sheetBtn"),
      download: $("downloadBtn"),
      undo: $("undoBtn"),
      redo: $("redoBtn"),
      flip: $("flipBtn"),
      clear: $("clearBtn"),
      importPng: $("importBtn"),
    },
    checks: { symmetry: $("symmetryChk"), grid: $("gridChk") },
    zoomRangeEl: $("zoomRange"),
    palettes: PALETTES,
    defaultPaletteKey: "steel",
    presetLabels: PRESET_LABELS,
    defaultPresetKey: "sword",
    makeRecipe,
    buildGrid,
    shuffleColors: false, // the slots mean metal / wood / accent / trim / paper
    galleryKey: "spriteforge.props.gallery",
    defaultCellPx: 12,
    exportCell: 16,
    filenamePrefix: "prop",
  });
  // Most props aren't left/right symmetric (they lie on the diagonal), so
  // mirror painting starts off here.
  $("symmetryChk").checked = false;
  $("symmetryChk").dispatchEvent(new Event("change"));

  // ---- variations ---------------------------------------------------------------
  const THUMB = 3;
  function renderVariations() {
    const box = $("variations"), chosen = $("presetSel").value, colors = PALETTES[$("paletteSel").value];
    const kinds = Object.keys(PRESET_LABELS);
    box.innerHTML = "";
    for (let i = 0; i < 12; i++) {
      const seed = Math.floor(Math.random() * 1e9);
      // "🎲 Random" (the editor adds it to Kind): a different kind per tile
      const kind = chosen in PRESET_LABELS ? chosen : kinds[Math.floor(Math.random() * kinds.length)];
      const grid = buildGrid(withSeededRandom(seed, () => makeRecipe(kind)), colors);
      const b = document.createElement("button");
      b.className = "variation";
      b.title = `Seed ${seed}`;
      b.setAttribute("aria-label", `${PRESET_LABELS[kind]} variation ${i + 1}`);
      const c = document.createElement("canvas");
      c.width = W * THUMB; c.height = H * THUMB;
      const ctx = c.getContext("2d");
      grid.forEach((col, j) => { if (col) { ctx.fillStyle = col; ctx.fillRect((j % W) * THUMB, Math.floor(j / W) * THUMB, THUMB, THUMB); } });
      b.appendChild(c);
      b.addEventListener("click", () => {
        if (!(chosen in PRESET_LABELS)) $("presetSel").value = kind; // replay exactly this one
        editor.doGenerate(seed);
        for (const v of box.querySelectorAll(".variation")) v.setAttribute("aria-pressed", String(v === b));
      });
      box.appendChild(b);
    }
  }
  $("moreBtn").addEventListener("click", renderVariations);
  $("presetSel").addEventListener("change", () => { renderVariations(); editor.doGenerate(); });
  $("paletteSel").addEventListener("change", () => { renderVariations(); editor.doGenerate(); });

  editor.boot();
  renderVariations();
})();
