// Spaceship hull generator — presets, recipe, and the pixel grid. Sits on
// the same shared editor engine (window.SpriteTool) as the hero generator:
// nose at the top, tail at the bottom, mirrored left/right around the same
// two-column centreline convention hero-shapes.js uses.
(() => {
  "use strict";
  const { outlinePass } = window.SpriteTool;
  const W = 20, H = 22;
  const CX0 = 9, CX1 = 10; // the two centre columns; mirror pairs are (CX0-i, CX1+i)
  const TOP = 1; // clearance above the nose tip for the outline pass

  // preset: [bodyLen, noseLen, coreHalfWidth, wingStartFrac, wingLen, wingSpan,
  //          engineCount, engineLen, cockpitSize, hullNoise, gunOdds]
  const PRESETS = {
    scout:       [6, 3, 2, 0.30, 3, 2, 1, 3, 1, 0.05, 0.10],
    interceptor: [8, 4, 2, 0.40, 4, 3, 2, 4, 1, 0.05, 0.30],
    fighter:     [9, 3, 3, 0.35, 5, 4, 2, 4, 1, 0.08, 0.50],
    corvette:    [10,3, 3, 0.50, 4, 3, 2, 3, 1, 0.10, 0.30],
    bomber:      [9, 2, 4, 0.55, 5, 6, 3, 3, 0, 0.12, 0.40],
    cruiser:     [12,3, 3, 0.45, 3, 2, 3, 4, 1, 0.10, 0.20],
    gunship:     [8, 2, 3, 0.30, 4, 3, 2, 3, 1, 0.10, 0.70],
    dreadnought: [12,2, 5, 0.50, 4, 4, 3, 4, 2, 0.14, 0.50],
    shuttle:     [8, 2, 4, 0.60, 3, 2, 1, 2, 2, 0.06, 0.00],
    saucer:      [5, 2, 5, 0.00, 5, 5, 1, 2, 1, 0.08, 0.20],
  };
  const PRESET_LABELS = {
    scout:"Scout", interceptor:"Interceptor", fighter:"Fighter", corvette:"Corvette",
    bomber:"Bomber", cruiser:"Cruiser", gunship:"Gunship", dreadnought:"Dreadnought",
    shuttle:"Shuttle", saucer:"Saucer",
  };
  // colour roles: [hull, panel, wing, glow, canopy] — same 5-slot shape as the
  // hero palettes, so a hull in c64/confetti/candy pairs thematically with a
  // hero in the same set.
  const PALETTES = {
    c64:      ["#70A4B2","#6F3D86","#B8C76F","#6F4F25","#588D43"],
    confetti: ["#FF3B8B","#FFD800","#7FE0D0","#8A5A10","#00B050"],
    candy:    ["#FFCFCF","#F43FC5","#66BAC4","#FFFF1A","#73BB98"],
  };

  // ---- shape recipe: every random choice, independent of colour -----------
  function makeRecipe(presetKey) {
    const [bodyLen, noseLen, coreW, wingStartFrac, wingLen, wingSpan,
           engineCount, engineLen, cockpitSize, hole, gunOdds] = PRESETS[presetKey];
    const totalLen = noseLen + bodyLen;
    const wingStart = noseLen + Math.round(bodyLen * wingStartFrac);
    const wingEnd = Math.min(totalLen, wingStart + wingLen);

    function widthAt(j) {
      if (j < noseLen) {
        // nose taper: near-zero at the tip, full core width by the body seam
        return Math.max(0, Math.round(((j + 1) / noseLen) * coreW));
      }
      if (j >= wingStart && j < wingEnd) {
        const span = Math.max(1, wingEnd - wingStart - 1);
        const t = (j - wingStart) / span;
        const curve = 1 - Math.abs(t - 0.5) * 2; // widest at mid-wing, tapering at both ends
        return coreW + Math.round(wingSpan * curve);
      }
      return coreW;
    }

    // Hull silhouette as (i, j) pairs, like the hero's torso list. Noise only
    // ever touches the outer edge column, never the interior — keeps the
    // fuselage solid while still giving a battle-worn, jagged wing edge.
    const hull = [];
    for (let j = 0; j < totalLen; j++) {
      const w = Math.max(1, widthAt(j));
      for (let i = 0; i < w; i++) {
        if (i === 0 || i < w - 1 || Math.random() > hole) hull.push([i, j]);
      }
    }

    const cockpitRow = cockpitSize > 0 ? noseLen + 1 : -1;

    // 1 engine -> a single centred nozzle; 2 -> one per side, off-centre;
    // 3 -> a centre engine plus a pair of outboard nacelles.
    const engineCols = engineCount === 1 ? [0] : engineCount === 2 ? [1] : [0, 2];

    // wingtip guns: a short barrel poking forward from the widest wing row,
    // only on hulls that actually have wings to mount them on
    const hasGuns = wingSpan > 0 && Math.random() < gunOdds;
    const gunRow = hasGuns ? wingStart + Math.round((wingEnd - wingStart) / 2) : -1;
    const gunSpan = hasGuns ? Math.max(0, widthAt(gunRow) - 1) : 0;

    return { totalLen, coreW, hull, cockpitRow, cockpitSize, engineCols, engineLen,
             hasGuns, gunRow, gunSpan };
  }

  // ---- bake a recipe + 5 colours into a 20x22 pixel grid -------------------
  function buildGrid(recipe, colors) {
    const [hullC, panelC, wingC, glowC, canopyC] = colors;
    const grid = new Array(W * H).fill(null);
    const idx = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? y * W + x : -1;
    const set = (x, y, c) => { const i = idx(x, y); if (i >= 0) grid[i] = c; };
    const { hull, coreW, cockpitRow, cockpitSize, engineCols, engineLen,
             hasGuns, gunRow, gunSpan, totalLen } = recipe;

    // fuselage + wings — the central band stays the hull colour even where a
    // wing extends past it, so the fuselage still reads through the wing
    for (const [i, j] of hull) {
      const c = i > coreW - 1 ? wingC : hullC;
      set(CX0 - i, TOP + j, c);
      set(CX1 + i, TOP + j, c);
    }

    // panel stripe, two-thirds down the hull — the ship's equivalent of the
    // hero's belt: a deliberate accent line instead of more random noise
    const stripeRow = Math.round(totalLen * 0.66);
    for (const [i, j] of hull) {
      if (j === stripeRow) { set(CX0 - i, TOP + j, panelC); set(CX1 + i, TOP + j, panelC); }
    }

    // cockpit canopy, just behind the nose tip
    if (cockpitRow >= 0) {
      for (let dj = 0; dj < 2; dj++) {
        for (let i = 0; i < cockpitSize; i++) {
          set(CX0 - i, TOP + cockpitRow + dj, canopyC);
          set(CX1 + i, TOP + cockpitRow + dj, canopyC);
        }
      }
    }

    // engines: a nozzle housing plus a glowing exhaust tip past the tail
    const tailRow = totalLen - 1;
    for (const off of engineCols) {
      for (const cx of [CX0 - off, CX1 + off]) {
        for (let k = 0; k < engineLen; k++) {
          set(cx, TOP + tailRow + 1 + k, k === engineLen - 1 ? glowC : panelC);
        }
      }
    }

    // wingtip guns: a short forward-poking barrel at the widest wing row
    if (hasGuns) {
      for (const cx of [CX0 - gunSpan, CX1 + gunSpan]) {
        set(cx, TOP + gunRow - 1, panelC);
        set(cx, TOP + gunRow - 2, glowC);
      }
    }

    outlinePass(grid, W, H, idx);
    return grid;
  }

  window.SpriteTool.ship = { W, H, PRESETS, PRESET_LABELS, PALETTES, makeRecipe, buildGrid };
})();
