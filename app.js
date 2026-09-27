(() => {
  "use strict";
  const W = 16, H = 26, GY = 24;
  const DARK = "#281e23", WHITE = "#ffffff";

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
    c64:      ["#70A4B2","#6F3D86","#B8C76F","#6F4F25","#588D43"],
    confetti: ["#FF3B8B","#FFD800","#7FE0D0","#8A5A10","#00B050"],
    candy:    ["#FFCFCF","#F43FC5","#66BAC4","#FFFF1A","#73BB98"],
  };

  function shuffled(arr){
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function randomColors(themeKey){ return shuffled(PALETTES[themeKey] || PALETTES.c64); }
  function randomPresetKey(){ const keys = Object.keys(PRESETS); return keys[Math.floor(Math.random()*keys.length)]; }

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
    const torso = [];
    for (let j = 0; j < th; j++) {
      const w = widthAt(j);
      for (let i = 0; i < hw; i++) {
        if (i === 0 || (i < w && Math.random() < 0.92 - hole)) torso.push([i, j]);
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

  function outlinePass(grid, idx) {
    const src = grid.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (src[i] !== null) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ni = idx(x + dx, y + dy);
        if (ni >= 0 && src[ni] !== null) { grid[i] = DARK; break; }
      }
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

    outlinePass(grid, idx);
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

    outlinePass(grid, idx);
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

    outlinePass(grid, idx);
    return grid;
  }

  // ---- profile: a genuinely different silhouette, not a transform of the --
  // ---- front view — single eye, a nose/jaw bump, and staggered legs/arms --
  // Torso/head sit at the SAME coordinates as the front view here, so their
  // colour is sampled straight off the live canvas; only legs/arms actually
  // move and need their colour carried from their original straight row.
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

    outlinePass(grid, idx);
    return grid;
  }

  // ---- app state ------------------------------------------------------------
  const state = {
    pixels: new Array(W * H).fill(null),
    tool: "pencil",
    color: "#70A4B2",
    symmetry: true,
    showGrid: false,
    cellPx: 22,
    undoStack: [],
    redoStack: [],
    gallery: [],
    lastPreset: null,
    lastRecipe: null,
    lastColors: null,
  };

  const canvas = document.getElementById("pixels");
  const ctx = canvas.getContext("2d");
  const toast = document.getElementById("toast");
  let toastTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
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
      for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x*cell+0.5,0); ctx.lineTo(x*cell+0.5,H*cell); ctx.stroke(); }
      for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0,y*cell+0.5); ctx.lineTo(W*cell,y*cell+0.5); ctx.stroke(); }
    }
  }
  let cssCache = {};
  function getCss(varName){
    if (!cssCache[varName]) cssCache[varName] = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return cssCache[varName];
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
        const mx = 15 - x;
        if (state.pixels[y * W + mx] === target) state.pixels[y * W + mx] = val;
      }
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
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
    if (state.symmetry) setPixel(15 - x, y, val);
  }

  // pointer drawing
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
    if (state.tool === "fill") return; // fill only fires once per stroke
    applyTool(cell[0], cell[1]);
    render();
  });
  function endStroke() { painting = false; lastCell = null; }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  // toolbar wiring
  document.querySelectorAll(".tbtn[data-tool]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tool = btn.dataset.tool;
      document.querySelectorAll(".tbtn[data-tool]").forEach(b => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
    });
  });
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);
  document.getElementById("flipBtn").addEventListener("click", flipHorizontal);
  document.getElementById("clearBtn").addEventListener("click", () => {
    pushUndo();
    state.pixels = new Array(W * H).fill(null);
    state.lastRecipe = null; // a blank canvas has no shape left to pose
    state.lastColors = null;
    render();
  });
  document.getElementById("symmetryChk").addEventListener("change", (e) => { state.symmetry = e.target.checked; });
  document.getElementById("gridChk").addEventListener("change", (e) => { state.showGrid = e.target.checked; render(); });
  document.getElementById("zoomRange").addEventListener("input", (e) => { state.cellPx = parseInt(e.target.value, 10); render(); });

  // keyboard shortcuts (undo, tool switches) — skipped for form fields
  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    if (e.key === "Escape") closePoseModal();
  });

  // palette / swatches
  const swatchesEl = document.getElementById("swatches");
  function renderSwatches() {
    const theme = document.getElementById("paletteSel").value;
    const cols = PALETTES[theme] || PALETTES.c64;
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
  document.getElementById("paletteSel").addEventListener("change", renderSwatches);

  // presets dropdown
  const presetSel = document.getElementById("presetSel");
  const randOpt = document.createElement("option");
  randOpt.value = "random"; randOpt.textContent = "🎲 Random";
  presetSel.appendChild(randOpt);
  Object.keys(PRESETS).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = PRESET_LABELS[key] || key;
    presetSel.appendChild(opt);
  });
  presetSel.value = "warrior";

  // generate / recolour / reshape
  function doGenerate() {
    pushUndo();
    const key = presetSel.value === "random" ? randomPresetKey() : presetSel.value;
    state.lastPreset = key;
    state.lastRecipe = makeRecipe(key);
    state.lastColors = randomColors(document.getElementById("paletteSel").value);
    state.pixels = buildGrid(state.lastRecipe, state.lastColors);
    render();
  }
  function doReshape() {
    if (!state.lastRecipe) return doGenerate();
    pushUndo();
    const key = presetSel.value === "random" ? randomPresetKey() : presetSel.value;
    state.lastPreset = key;
    state.lastRecipe = makeRecipe(key);
    if (!state.lastColors) state.lastColors = randomColors(document.getElementById("paletteSel").value);
    state.pixels = buildGrid(state.lastRecipe, state.lastColors);
    render();
  }
  function doRecolor() {
    if (!state.lastRecipe) return doGenerate();
    pushUndo();
    state.lastColors = randomColors(document.getElementById("paletteSel").value);
    state.pixels = buildGrid(state.lastRecipe, state.lastColors);
    render();
  }
  document.getElementById("generateBtn").addEventListener("click", doGenerate);
  document.getElementById("reshapeBtn").addEventListener("click", doReshape);
  document.getElementById("recolorBtn").addEventListener("click", doRecolor);

  // gallery
  const galleryStrip = document.getElementById("galleryStrip");
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
    try { localStorage.setItem("spriteforge.gallery", JSON.stringify(state.gallery.slice(0, 24))); }
    catch (e) { /* private mode or full — ignore, gallery just won't persist */ }
  }
  function loadGallery() {
    try {
      const raw = localStorage.getItem("spriteforge.gallery");
      if (raw) state.gallery = JSON.parse(raw) || [];
    } catch (e) { state.gallery = []; }
  }
  function renderGallery() {
    galleryStrip.innerHTML = "";
    if (!state.gallery.length) {
      const p = document.createElement("span");
      p.className = "empty-note";
      p.textContent = "Saved sprites appear here.";
      galleryStrip.appendChild(p);
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
        pushUndo();
        state.pixels = entry.pixels.slice();
        // restore the shape recipe too, so this becomes the "active" body for
        // reshape/recolour/pose-sheet, not whatever was generated before it
        state.lastRecipe = entry.recipe || null;
        state.lastColors = entry.colors || null;
        render();
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
      galleryStrip.appendChild(wrap);
    });
  }
  document.getElementById("saveBtn").addEventListener("click", () => {
    const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
                     pixels: state.pixels.slice(), thumb: thumbDataURL(state.pixels),
                     // carried along so loading this entry later can pose it too
                     recipe: state.lastRecipe, colors: state.lastColors };
    state.gallery.unshift(entry);
    persistGallery();
    renderGallery();
    showToast("Saved to gallery.");
  });

  // export sheet — packs every saved gallery sprite into one PNG grid
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
  function downloadCanvas(canvas, filename) {
    canvas.toBlob((blob) => {
      if (!blob) { showToast("Could not build the image."); return; }
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
  document.getElementById("sheetBtn").addEventListener("click", () => {
    if (!state.gallery.length) { showToast("Save a few sprites to the gallery first."); return; }
    const sheet = buildSheetCanvas(state.gallery);
    downloadCanvas(sheet, "sprite-sheet.png");
    showToast(`Exported ${state.gallery.length} sprite${state.gallery.length === 1 ? "" : "s"} as one sheet.`);
  });

  // pose sheet — front/back/side/run/jump, coloured from the CURRENTLY
  // ACTIVE canvas. "front" is the live pixels verbatim; every other view
  // samples its colours from that same canvas (see buildGridBack/Jump/Profile
  // above), so a hand-painted recolour or detail carries into every pose.
  // The recipe still supplies the geometry (limb lengths/angles, part
  // boundaries) — that part can't come from raw pixels, since nothing marks
  // which pixel is "arm" once it's just colour in a flat grid.
  function buildPoseSheetCanvas(recipe, colors, livePixels) {
    const views = [
      ["front", () => livePixels.slice()],
      ["back",  () => buildGridBack(recipe, colors, livePixels)],
      ["side",  () => buildGridProfile(recipe, colors, livePixels, 0)],
      ["run 1", () => buildGridProfile(recipe, colors, livePixels, 1)],
      ["run 2", () => buildGridProfile(recipe, colors, livePixels, -1)],
      ["jump",  () => buildGridJump(recipe, colors, livePixels)],
    ];
    const cell = 12, pad = 6, labelH = 16;
    const cw = W * cell, ch = H * cell;
    const canvas = document.createElement("canvas");
    canvas.width = views.length * (cw + pad) + pad;
    canvas.height = ch + labelH + pad * 2;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    views.forEach(([name, fn], i) => {
      const grid = fn();
      const ox = pad + i * (cw + pad), oy = pad;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = grid[y * W + x];
        if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
      }
      ctx.fillStyle = "#9c93c9";
      ctx.font = "11px 'VT323', monospace";
      ctx.textAlign = "center";
      ctx.fillText(name, ox + cw / 2, oy + ch + 12);
    });
    return canvas;
  }
  let poseSheetCanvas = null;
  const poseModalBackdrop = document.getElementById("poseModalBackdrop");
  function closePoseModal() { poseModalBackdrop.hidden = true; }
  document.getElementById("poseSheetBtn").addEventListener("click", () => {
    if (!state.lastRecipe || !state.lastColors) {
      showToast("This sprite has no shape data to pose — generate one first.");
      return;
    }
    poseSheetCanvas = buildPoseSheetCanvas(state.lastRecipe, state.lastColors, state.pixels);
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
    showToast("Exported pose sheet.");
  });

  // download — a plain browser download, no special host capability needed
  const downloadBtn = document.getElementById("downloadBtn");
  downloadBtn.addEventListener("click", () => {
    const exportCell = 16;
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
      a.download = "sprite.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast("Downloaded.");
    }, "image/png");
  });

  // boot
  function boot() {
    renderSwatches();
    loadGallery();
    renderGallery();
    doGenerate();
  }
  boot();
})();
