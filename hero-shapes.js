// Humanoid hero shape generator — presets, recipe, and every pose's pixel
// grid. Draws on the shared editor engine (window.SpriteTool) for the
// generic outline pass and special colours, but knows nothing about canvas
// wiring, undo/redo or the gallery — that's editor-core.js's job.
(() => {
  "use strict";
  const { DARK, WHITE, outlinePass, pickNoiseRuns } = window.SpriteTool;
  const W = 16, H = 26, GY = 24;

  // preset: [headRx, headRy, torsoHalfWidth, torsoHeight, legLen, armLen, torsoHole, extraOdds]
  const PRESETS = {
    stick:   [2.4,2.4,2,4,5,4,0.00,0.4],
    bighead: [4.0,3.6,2,3,3,2,0.05,0.4],
    stocky:  [3.0,2.6,4,5,3,4,0.04,0.4],
    long:    [2.6,3.0,3,6,5,5,0.05,0.3],
    ragged:  [3.2,3.0,3,4,4,3,0.18,0.6],
    tiny:    [3.0,2.8,2,3,2,2,0.00,0.8],
    knight:  [2.8,2.6,5,5,4,5,0.02,0.5],
    runner:  [2.2,2.4,2,5,6,4,0.00,0.3],
    giant:   [3.6,3.0,5,6,3,5,0.05,0.4],
    wisp:    [3.4,3.2,1,2,2,2,0.00,0.2],
    man:     [2.2,2.6,3,7,7,6,0.00,1.0],
    woman:   [2.0,2.6,2,7,7,6,0.00,1.0],
    warrior: [2.0,2.4,3,6,6,6,0.00,1.0],
    mage:    [2.0,2.6,2,8,6,5,0.00,1.0],
    scout:   [2.0,2.4,2,6,7,5,0.00,1.0],
    ranger:  [2.0,2.4,2,6,7,5,0.00,1.0],
  };
  const PRESET_LABELS = {
    stick:"Stick figure", bighead:"Big head", stocky:"Stocky", long:"Long-limbed",
    ragged:"Ragged", tiny:"Tiny", knight:"Knight", runner:"Runner", giant:"Giant",
    wisp:"Wisp", man:"Man", woman:"Woman", warrior:"Warrior", mage:"Mage", scout:"Scout",
    ranger:"Ranger",
  };
  const DEFAULT_STYLE = { extras:["horns","antenna","ears"], flare:false, cape:false };
  const PRESET_STYLE = {
    man:     { extras:["hair_short","hair_short","none"], flare:false, cape:false },
    woman:   { extras:["hair_long","hair_long","hair_short"], flare:true, cape:false },
    warrior: { extras:["hair_short","none"], flare:false, cape:true },
    mage:    { extras:["hair_long"], flare:true, cape:false },
    scout:   { extras:["hair_short","hair_long"], flare:false, cape:true },
    ranger:  { extras:["hood","hood","hair_short"], flare:false, cape:true },
  };
  const PALETTES = {
    c64:        ["#70A4B2","#6F3D86","#B8C76F","#6F4F25","#588D43"],
    confetti:   ["#FF3B8B","#FFD800","#7FE0D0","#8A5A10","#00B050"],
    candy:      ["#FFCFCF","#F43FC5","#66BAC4","#FFFF1A","#73BB98"],
    deepspace:  ["#2C3454","#8A93A8","#4A3B6B","#4FE8F0","#9FD6FF"],
    nebula:     ["#C13FA0","#6B3FA0","#3FA0C1","#FFD93F","#E6C2FF"],
    solarflare: ["#D9622B","#8C2F1B","#F2A93B","#FFEB3B","#FFD8A8"],
    icefield:   ["#8FD8E0","#2E5C73","#4FA8B8","#FFFFFF","#B8E4FF"],
    toxic:      ["#6FA83D","#3D5C1F","#8C3DA8","#C6FF3D","#BFFF8A"],
  };

  // ---- shape recipe: every random choice, independent of colour -----------
  function makeRecipe(presetKey) {
    const [hrx, hry, hw, th, leg, arm, hole, top] = PRESETS[presetKey];
    const hh = Math.max(4, Math.round(hry * 2));
    const hwid = Math.max(2, Math.round(hrx));
    const cy = (hh - 1) / 2;

    const head = [];
    for (let i = 0; i < hwid; i++) for (let j = 0; j < hh; j++) {
      const inEllipse = ((i + 0.5) / hrx) ** 2 + ((j - cy) / hry) ** 2 <= 1;
      if (inEllipse && (i === 0 || Math.random() < 0.95)) head.push([i, j]);
    }
    // Torso silhouette: full width at the shoulders and hem, pinched in at the
    // waist in between (a hem this deliberate reads as a garment, not a box).
    const pinch = hw >= 2 ? 1 : 0;
    const shoulderRows = Math.min(2, th);
    const hemRows = th >= 6 ? 2 : 1;
    const taperEnd = Math.max(shoulderRows, th - hemRows);
    function widthAt(j) {
      if (j < shoulderRows || j >= taperEnd || taperEnd <= shoulderRows) return hw;
      const span = Math.max(1, taperEnd - shoulderRows - 1);
      const t = (j - shoulderRows) / span;
      const curve = 1 - Math.abs(t - 0.5) * 2; // 0 at the taper's edges, 1 at its middle
      return Math.max(1, hw - Math.round(pinch * curve));
    }
    // A few short runs of rows lose their outer edge pixel, rather than an
    // independent coin flip on every pixel of every row — the old per-pixel
    // roll read as all-over static; a handful of multi-row notches reads as
    // actual wear (matches the same technique in ship-shapes.js).
    const notchedRows = pickNoiseRuns(th, hole);
    const torso = [];
    for (let j = 0; j < th; j++) {
      const w = widthAt(j);
      for (let i = 0; i < hw; i++) {
        if (i === 0 || i < w - 1 || (i < w && !notchedRows.has(j))) torso.push([i, j]);
      }
    }
    // A belt stripe and a small chest emblem replace random noise with a
    // costume that reads as designed rather than scattered.
    const beltRow = th >= 4 ? Math.min(th - 2, Math.round(th * 0.62)) : -1;
    const emblemRow = th >= 3 ? 1 : -1;

    const ei = Math.min(hwid - 1, hwid < 4 ? 1 : 2);
    const ej = Math.floor(hh / 2) - 1;
    const eyeStyle = Math.random() < (2 / 3) ? "dot" : "white";
    const mouth = hh >= 6 && Math.random() < 0.5;

    const style = PRESET_STYLE[presetKey] || DEFAULT_STYLE;
    let extra = [], backHair = false;
    if (Math.random() < top) {
      const kind = style.extras[Math.floor(Math.random() * style.extras.length)];
      if (kind === "hair_long") { backHair = true; for (let i = 0; i < hwid; i++) extra.push([i, -1]); }
      else if (kind === "hair_short") { for (let i = 0; i < hwid; i++) extra.push([i, -1]); }
      else if (kind === "horns") { extra = [[hwid - 2, -1], [hwid - 1, -2]]; }
      else if (kind === "antenna") { extra = [[0, -1], [0, -2]]; }
      else if (kind === "ears") { extra = [[hwid, ej]]; }
      else if (kind === "hood") {
        backHair = true; // cloak mass hangs behind, using the same back-hair renderer
        for (let i = 0; i < hwid; i++) extra.push([i, -1]);
        extra.push([0, -2]); // a peaked tip above the crown
      }
    }
    const capeDir = style.cape ? (Math.random() < 0.5 ? -1 : 1) : 0;

    return { hw, th, leg, arm, hh, hwid, head, torso, beltRow, emblemRow, ei, ej, eyeStyle, mouth,
             extra, backHair, capeDir, flare: !!style.flare };
  }

  // ---- shared geometry: where the hips/torso-top/head-top land -------------
  function computeLayout(recipe) {
    const hipY = GY - recipe.leg + 1;
    const ttop = hipY - recipe.th;
    const htop = ttop - recipe.hh + 1;
    return { hipY, ttop, htop };
  }

  // Straight-down limb (the original, unposed look): a column `length` tall,
  // optionally doubled in width, with the last pixel(s) recoloured as the
  // hand/foot. Kept separate from the angled version below so the default
  // front sprite's pixels never change.
  function vlimb(set, col, yTop, length, limbColor, endColor, thick, foot) {
    for (let k = 0; k < length; k++) {
      const y = yTop + k;
      set(col, y, limbColor);
      if (thick) set(col - 1, y, limbColor);
    }
    const lastY = yTop + length - 1;
    set(col, lastY, endColor);
    if (foot) set(col + 1, lastY, endColor);
  }

  // A Bresenham line — used by the posed limb renderer below so a limb can
  // swing at an angle instead of only hanging straight down.
  function linePts(x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const pts = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      pts.push([x0, y0]);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return pts;
  }
  // A limb that swings `angleDeg` off straight-down, toward `faceDir`
  // (+1/-1). angleDeg = 0 reproduces vlimb() exactly.
  function limbAngled(set, x0, y0, length, angleDeg, faceDir, color, endColor, thick, foot) {
    const rad = (angleDeg * Math.PI) / 180;
    const x1 = x0 + faceDir * Math.sin(rad) * (length - 1);
    const y1 = y0 + Math.cos(rad) * (length - 1);
    const pts = linePts(x0, y0, x1, y1);
    for (const [x, y] of pts) { set(x, y, color); if (thick) set(x - faceDir, y, color); }
    const [lx, ly] = pts[pts.length - 1];
    set(lx, ly, endColor);
    if (foot) set(lx + faceDir, ly, endColor);
  }

  // Paints the torso (hair mass behind it, belt, emblem, neck, flare) — the
  // part of the body that must land BEFORE the arms so a broad-shouldered
  // sleeve can overlap the torso's edge, matching the original z-order.
  // opts: bx/by shift the torso as a unit.
  function paintTorso(set, colors, recipe, ttop, htop, opts = {}) {
    const { bx = 0, by = 0 } = opts;
    const [skin, body, , acc, hairC] = colors;
    const { hw, th, hh, hwid, torso, beltRow, emblemRow, backHair, flare } = recipe;

    if (backHair) {
      const hairH = hh + 5;
      for (let j = 0; j < hairH; j++) {
        const width = Math.max(1, Math.round((hwid + 1) * (1 - j / hairH)));
        for (let i = 0; i < width; i++) { set(7 - i + bx, htop + j + by, hairC); set(8 + i + bx, htop + j + by, hairC); }
      }
    }
    for (const [i, j] of torso) {
      const c = j === beltRow ? acc : body;
      set(7 - i + bx, ttop + j + by, c); set(8 + i + bx, ttop + j + by, c);
    }
    if (emblemRow >= 0) { set(7 + bx, ttop + emblemRow + by, hairC); set(8 + bx, ttop + emblemRow + by, hairC); }
    if (th >= 3) { set(7 + bx, ttop + by, skin); set(8 + bx, ttop + by, skin); } // neck peeking out under the collar
    if (flare) {
      for (const j of [th - 2, th - 1]) { set(7 - hw - 1 + bx, ttop + j + by, body); set(8 + hw + 1 + bx, ttop + j + by, body); }
    }
  }

  // Paints the cape streamer, head, hood/horns/hair and face — the part of
  // the body that lands AFTER the arms. Shared by every view (front, back,
  // jump) so a new pose never has to re-describe the costume — only how the
  // limbs move and whether the face shows.
  // opts: bx/by shift the torso+head as a unit, hx/hy shift the head only
  // (relative to the torso), hideFace skips eyes/nose/mouth (back view).
  function paintHead(set, colors, recipe, ttop, htop, opts = {}) {
    const { bx = 0, by = 0, hx = 0, hy = 0, hideFace = false } = opts;
    const [, , , , hairC] = colors;
    const [skin] = colors;
    const { hwid, head, ei, ej, eyeStyle, mouth, extra, capeDir } = recipe;

    if (capeDir) {
      for (let k = 0; k < 5; k++) {
        const cx = 7 + bx + capeDir * (hwid + Math.floor(k / 2));
        const cy = htop + by + ej - 1 - k;
        set(cx, cy, hairC);
        if (k % 2 === 0) set(cx - capeDir, cy, hairC);
      }
    }
    const hxo = bx + hx, hyo = by + hy;
    for (const [i, j] of head) { set(7 - i + hxo, htop + j + hyo, skin); set(8 + i + hxo, htop + j + hyo, skin); }
    for (const [i, j] of extra) { set(7 - i + hxo, htop + j + hyo, hairC); set(8 + i + hxo, htop + j + hyo, hairC); }

    if (!hideFace) {
      const eyeL = [7 - ei + hxo, htop + ej + hyo], eyeR = [8 + ei + hxo, htop + ej + hyo];
      if (eyeStyle === "dot") {
        set(eyeL[0], eyeL[1], DARK); set(eyeL[0], eyeL[1] + 1, DARK);
        set(eyeR[0], eyeR[1], DARK); set(eyeR[0], eyeR[1] + 1, DARK);
      } else {
        set(eyeL[0] - 1, eyeL[1], WHITE); set(eyeR[0] - 1, eyeR[1], WHITE);
        set(eyeL[0], eyeL[1], DARK); set(eyeR[0], eyeR[1], DARK);
      }
      set(7 + hxo, htop + ej + 2 + hyo, DARK);
      if (mouth) { set(7 + hxo, htop + ej + 3 + hyo, DARK); set(8 + hxo, htop + ej + 3 + hyo, DARK); }
    }
  }

  // Carries a whole horizontal band of the live canvas (every x, y0..y1)
  // into a pose, offset by (dx, dy). This is what lets ANYTHING drawn in that
  // band — a huge hand-drawn headdress, a wide cape, an added collar, not
  // just the recipe's own hair/cape cells — actually show up in other poses,
  // rather than being approximated from a couple of sampled points.
  function copyBand(set, livePixels, y0, y1, dx, dy) {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      for (let x = 0; x < W; x++) {
        const c = livePixels[y * W + x];
        if (c) set(x + dx, y + dy, c);
      }
    }
  }

  // ---- bake a recipe + 5 colours into a 16x26 pixel grid (front, standing) -
  function buildGrid(recipe, colors) {
    const [skin, , limb, acc] = colors;
    const grid = new Array(W * H).fill(null);
    const idx = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? y * W + x : -1;
    const set = (x, y, c) => { const i = idx(x, y); if (i >= 0) grid[i] = c; };
    const { hw, arm, leg } = recipe;
    const { hipY, ttop, htop } = computeLayout(recipe);

    vlimb(set, 9 - hw, hipY, leg, limb, acc, true, true);
    vlimb(set, 6 + hw, hipY, leg, limb, acc, true, true);
    paintTorso(set, colors, recipe, ttop, htop, {});
    const thickArms = hw >= 4;
    vlimb(set, 7 - hw, ttop + 1, arm, limb, skin, thickArms, false);
    vlimb(set, 8 + hw, ttop + 1, arm, limb, skin, thickArms, false);
    paintHead(set, colors, recipe, ttop, htop, {});

    outlinePass(grid, W, H, idx);
    return grid;
  }

  // A limb that swings at an angle, colouring each point by SAMPLING the live
  // canvas at that row's original straight-down position (colorAt(row)),
  // instead of one flat colour. This is what lets a hand-painted boot or
  // sleeve detail survive into a posed view: the row moved, but its colour
  // came from wherever that row actually is on the canvas right now.
  function limbAngledSampled(set, x0, y0, length, angleDeg, faceDir, colorAt, thick, foot) {
    const rad = (angleDeg * Math.PI) / 180;
    const x1 = x0 + faceDir * Math.sin(rad) * (length - 1);
    const y1 = y0 + Math.cos(rad) * (length - 1);
    const pts = linePts(x0, y0, x1, y1);
    pts.forEach(([x, y], i) => {
      const t = pts.length > 1 ? i / (pts.length - 1) : 0;
      const row = Math.round(t * (length - 1));
      const c = colorAt(row);
      set(x, y, c);
      if (thick) set(x - faceDir, y, c);
    });
    if (foot) {
      const [lx, ly] = pts[pts.length - 1];
      set(lx + faceDir, ly, colorAt(length - 1));
    }
  }

  // ---- back view: the raw canvas, verbatim — only the face is blanked ------
  // Torso, arms, legs and hair sit at the exact same coordinates seen from
  // the front, so "posing" the back is really just: don't draw a face.
  function buildGridBack(recipe, colors, livePixels) {
    const idx = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? y * W + x : -1;
    const grid = livePixels.slice();
    const { ei, ej, hwid, mouth } = recipe;
    const { htop } = computeLayout(recipe);
    // refill a blanked face cell with a live skin tone sampled from the head's
    // own edge, so a recoloured skin still matches on the back of the head
    const skinAt = (row) => {
      const i = idx(7 - hwid + 1, htop + row);
      return (i >= 0 && grid[i]) || colors[0];
    };
    const eyeL = [7 - ei, htop + ej], eyeR = [8 + ei, htop + ej];
    for (const [x, y] of [eyeL, [eyeL[0], eyeL[1] + 1], [eyeL[0] - 1, eyeL[1]],
                          eyeR, [eyeR[0], eyeR[1] + 1], [eyeR[0] + 1, eyeR[1]]]) {
      const i = idx(x, y); if (i >= 0) grid[i] = skinAt(y - htop);
    }
    const rows = [ej + 2, ...(mouth ? [ej + 3] : [])];
    for (const r of rows) { for (const x of [7, 8]) { const i = idx(x, htop + r); if (i >= 0) grid[i] = skinAt(r); } }

    outlinePass(grid, W, H, idx);
    return grid;
  }

  // ---- jump: legs tuck outward, arms raise, body lifts one pixel -----------
  // Everything is sampled from the live canvas at its ORIGINAL (unposed)
  // position, then redrawn at the jump's angle/offset — so a hand-painted
  // recolour anywhere on the body still shows up here.
  function buildGridJump(recipe, colors, livePixels) {
    const grid = new Array(W * H).fill(null);
    const idx = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? y * W + x : -1;
    const set = (x, y, c) => { const i = idx(x, y); if (i >= 0) grid[i] = c; };
    const sample = (x, y, fallback) => { const i = idx(x, y); return (i >= 0 && livePixels[i]) || fallback; };
    const { hw, th, arm, leg } = recipe;
    const { hipY, ttop } = computeLayout(recipe);
    const by = -1;

    // Everything above the hips rides up with the jump as one block — this
    // is what carries a whole hand-drawn headdress or cape, not just the
    // recipe's own hair/cape cells. Arms are drawn resting here and get
    // overwritten by the angled versions below.
    copyBand(set, livePixels, 0, ttop, 0, by);       // head + anything above the torso
    copyBand(set, livePixels, ttop, ttop + th, 0, by); // torso band: belt, emblem, flare, cape, resting arms

    const legLCol = 9 - hw, legRCol = 6 + hw;
    limbAngledSampled(set, legLCol, hipY + by, leg, 35, -1, (r) => sample(legLCol, hipY + r, colors[2]), true, true);
    limbAngledSampled(set, legRCol, hipY + by, leg, 35, 1, (r) => sample(legRCol, hipY + r, colors[2]), true, true);
    const thickArms = hw >= 4;
    const armLCol = 7 - hw, armRCol = 8 + hw;
    limbAngledSampled(set, armLCol, ttop + 1 + by, arm, 165, -1, (r) => sample(armLCol, ttop + 1 + r, colors[0]), thickArms, false);
    limbAngledSampled(set, armRCol, ttop + 1 + by, arm, 165, 1, (r) => sample(armRCol, ttop + 1 + r, colors[0]), thickArms, false);

    outlinePass(grid, W, H, idx);
    return grid;
  }

  // ---- profile: a genuinely different silhouette, not a transform of the --
  // ---- front view — single eye, a nose/jaw bump, and staggered legs/arms --
  // Torso/head sit at the SAME coordinates as the front view here, so their
  // colour is sampled straight off the live canvas; only legs/arms actually
  // move and need their colour carried from their own straight-down row.
  // `stride`: 0 = standing side view, +1 / -1 = the two run-cycle extremes.
  function buildGridProfile(recipe, colors, livePixels, stride) {
    const grid = new Array(W * H).fill(null);
    const idx = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? y * W + x : -1;
    const set = (x, y, c) => { const i = idx(x, y); if (i >= 0) grid[i] = c; };
    const sample = (x, y, fallback) => { const i = idx(x, y); return (i >= 0 && livePixels[i]) || fallback; };
    const { hw, th, hwid, leg, arm, ei, ej, hh } = recipe;
    const { hipY, ttop, htop } = computeLayout(recipe);
    const faceDir = 1;
    const strideMag = 34;
    const legFrontAngle = 14 + stride * strideMag;
    const legBackAngle = -12 - stride * strideMag * 0.8;
    const armFrontAngle = -stride * 30 + 6;
    const armBackAngle = stride * 30 - 6;

    // Everything above the hips is carried over as-is — this is what shows a
    // whole hand-drawn headdress, hat or cape, not just the recipe's own
    // hair/cape cells. Neither band moves position in profile, so no offset.
    copyBand(set, livePixels, 0, ttop, 0, 0);       // head + anything drawn above the torso
    copyBand(set, livePixels, ttop, ttop + th, 0, 0); // torso band: belt, emblem, flare, cape, resting arms

    // legs: one biased toward the facing direction (front leg), one away —
    // each overwrites the resting leg with an angled one, colour carried from
    // its own straight-down row in the live canvas
    const legBackOrigin = 9 - hw, legFrontOrigin = 6 + hw;
    limbAngledSampled(set, 6 + faceDir, hipY, leg, legBackAngle, faceDir,
                       (r) => sample(legBackOrigin, hipY + r, colors[2]), false, true);
    limbAngledSampled(set, 8 + faceDir, hipY, leg, legFrontAngle, faceDir,
                       (r) => sample(legFrontOrigin, hipY + r, colors[2]), false, true);

    // arms: same front/back stagger, overwriting the resting arms the band-copy left behind
    const armBackOrigin = 7 - hw, armFrontOrigin = 8 + hw;
    limbAngledSampled(set, 7 - faceDir, ttop + 1, arm, armBackAngle, faceDir,
                       (r) => sample(armBackOrigin, ttop + 1 + r, colors[0]), false, false);
    limbAngledSampled(set, 8 + faceDir, ttop + 1, arm, armFrontAngle, faceDir,
                       (r) => sample(armFrontOrigin, ttop + 1 + r, colors[0]), false, false);

    // single eye + nose/jaw bump, drawn on top so the silhouette still reads
    // as turned even though the head itself wasn't redrawn from scratch
    const eyeX = 7 + faceDir * Math.max(1, hwid - 1);
    set(eyeX, htop + ej, sample(8 + ei, htop + ej, DARK));
    const noseFallback = sample(7 + hwid - 1, htop + Math.min(ej + 1, hh - 1), colors[0]);
    set(8 + faceDir * hwid, htop + ej + 1, noseFallback); // pokes one pixel past the head's edge

    outlinePass(grid, W, H, idx);
    return grid;
  }

  // A smooth N-frame run cycle — the same buildGridProfile math the static
  // "run 1"/"run 2" poses use, just sampled at more points along the swing
  // instead of only its two extremes. Uses sin() rather than a linear ramp
  // between -1 and 1: a swinging limb decelerates to a stop at each extreme
  // before reversing, it doesn't move at constant angular speed, so an even
  // linear step between keyframes looks mechanical where a sine wave doesn't.
  function buildRunCycleFrames(recipe, colors, livePixels, frameCount = 8) {
    const frames = [];
    for (let k = 0; k < frameCount; k++) {
      const stride = Math.sin((2 * Math.PI * k) / frameCount);
      frames.push(buildGridProfile(recipe, colors, livePixels, stride));
    }
    return frames;
  }

  window.SpriteTool.hero = { W, H, PRESETS, PRESET_LABELS, PALETTES, makeRecipe, buildGrid,
                             buildGridBack, buildGridProfile, buildGridJump, buildRunCycleFrames };
})();
