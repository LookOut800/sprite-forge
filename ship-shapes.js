// Spaceship hull generator — presets, recipe, and the pixel grid, rendered
// from TWO angles off one shared hull description: a top-down view (nose up,
// mirrored left/right — this is the editable canvas) and a side view (nose
// right, mirrored top/bottom — a read-only preview). Both views walk the
// same `hull` list and feature markers through an `orient` function that
// maps (lengthIndex, widthIndex) to pixel coordinates, so a hull is defined
// once and drawn from either angle.
(() => {
  "use strict";
  const { outlinePass } = window.SpriteTool;
  const SIZE = 30;
  const C0 = 14, C1 = 15; // the two centre columns/rows the width axis mirrors around
  const MAX_HALF_WIDTH = SIZE - C1 - 2; // leaves room for the outline pass at the widest wingtip

  // preset: [bodyLen, noseLen, coreHalfWidth, wingStartFrac, wingLen, wingSpan,
  //          engineCount, engineLen, cockpitSize, hullNoise, gunOdds, finOdds,
  //          spikeOdds, wingStyle, hasBooms, wingAccentOdds]
  // wingStyle is what makes each class read as a different kind of hull:
  //   'delta'    — full span at the root, swept back to a point (fighter-ish)
  //   'straight' — full span across the whole band, blunt tip (bomber-ish)
  //   'none'     — no main wing bulge at all (sleek dart or utility pod)
  //   'round'    — symmetric bulge, peaks in the middle (the saucer's disc)
  // hasBooms adds a pair of thin engine-tipped rails past the wingtips and
  // drops the centreline engines — a twin-boom silhouette, distinct from
  // every centreline-engine class. wingAccentOdds adds a pair of hardpoint
  // markers along the wing (one near the root, one near the tip) — a fighter
  // hallmark, dialled up for the combat classes and off elsewhere.
  const PRESETS = {
    scout:       [9, 4, 2, 0.30, 5, 4,  1, 4, 1, 0.05, 0.00, 0.5, 0.5, "none",     false, 0.0],
    interceptor: [12,5, 2, 0.40, 6, 7,  2, 5, 1, 0.05, 0.30, 0.4, 0.3, "delta",    false, 0.5],
    fighter:     [13,4, 3, 0.35, 7, 8,  2, 5, 2, 0.08, 0.90, 0.5, 0.2, "delta",    false, 0.9],
    corvette:    [15,4, 3, 0.50, 5, 5,  2, 4, 2, 0.10, 0.00, 0.0, 0.1, "straight", true,  0.0],
    bomber:      [13,3, 5, 0.55, 7, 8,  3, 4, 0, 0.12, 0.20, 0.3, 0.0, "straight", false, 0.0],
    cruiser:     [18,4, 4, 0.45, 5, 7,  3, 5, 2, 0.10, 0.20, 0.4, 0.1, "straight", false, 0.2],
    gunship:     [12,3, 3, 0.30, 5, 5,  2, 4, 2, 0.10, 0.80, 0.3, 0.2, "delta",    false, 0.6],
    dreadnought: [18,3, 6, 0.50, 6, 7,  3, 5, 3, 0.14, 0.50, 0.5, 0.0, "straight", false, 0.3],
    shuttle:     [12,3, 5, 0.60, 4, 3,  1, 3, 3, 0.06, 0.00, 0.2, 0.1, "none",     false, 0.0],
    saucer:      [7, 3, 6, 0.00, 6, 6,  1, 3, 2, 0.08, 0.20, 0.0, 0.3, "round",    false, 0.0],
  };
  const PRESET_LABELS = {
    scout:"Scout", interceptor:"Interceptor", fighter:"Fighter", corvette:"Corvette",
    bomber:"Bomber", cruiser:"Cruiser", gunship:"Gunship", dreadnought:"Dreadnought",
    shuttle:"Shuttle", saucer:"Saucer",
  };
  // colour roles: [hull, panel, wing, glow, canopy] — same 5-slot shape as the
  // hero palettes (c64/confetti/candy pair thematically with a hero in the
  // same set), plus five sets built for the space theme specifically.
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

  // A bulge shape shared by the main wing and the tailplane: how far past
  // coreW the hull extends at length-index t, within [start,end).
  function bulgeAt(t, start, end, span, style) {
    const len = Math.max(1, end - start - 1);
    const u = (t - start) / len;
    let curve;
    if (style === "delta") curve = 1 - u;                          // full at root, point at tip
    else if (style === "straight") curve = u < 0.8 ? 1 : (1 - (u - 0.8) / 0.2); // full span, blunt tip
    else curve = 1 - Math.abs(u - 0.5) * 2;                        // round: peaks in the middle
    return Math.round(span * curve);
  }

  // ---- shape recipe: every random choice, independent of colour or angle ---
  function makeRecipe(presetKey) {
    const [bodyLen, noseLen, coreW, wingStartFrac, wingLen, wingSpan,
           engineCount, engineLen, cockpitSize, hole, gunOdds, finOdds,
           spikeOdds, wingStyle, hasBooms, wingAccentOdds] = PRESETS[presetKey];
    const totalLen = noseLen + bodyLen;
    const wingStart = noseLen + Math.round(bodyLen * wingStartFrac);
    const wingEnd = Math.min(totalLen, wingStart + wingLen);

    // decorative extras, decided up front since they also affect widthAt
    const hasFins = wingStyle !== "round" && Math.random() < finOdds;
    const hasSpike = Math.random() < spikeOdds;
    // a small tailplane just ahead of the engines — always a delta taper
    // (a pointed stabiliser), regardless of the main wing's own shape, so
    // even a wingless dart gets a bit of tail flare
    const tailLen = Math.min(3, Math.max(2, Math.round(wingLen * 0.3)));
    const tailSpan = Math.round(wingSpan * 0.45);
    const tailStart = Math.max(wingEnd, totalLen - tailLen);
    const tailEnd = Math.min(totalLen, tailStart + tailLen);

    function widthAt(t) {
      let w;
      if (t < noseLen) {
        // nose taper: near-zero at the tip, full core width by the body seam
        w = Math.max(0, Math.round(((t + 1) / noseLen) * coreW));
      } else if (wingStyle !== "none" && t >= wingStart && t < wingEnd) {
        w = coreW + bulgeAt(t, wingStart, wingEnd, wingSpan, wingStyle);
      } else if (hasFins && t >= tailStart && t < tailEnd) {
        w = coreW + bulgeAt(t, tailStart, tailEnd, tailSpan, "delta");
      } else {
        w = coreW;
      }
      // a preset's own numbers could still add up to more than the canvas
      // can fit — clamp so a wingtip never runs off the edge uncapped
      return Math.min(w, MAX_HALF_WIDTH);
    }

    // Hull silhouette as (widthIndex, lengthIndex) pairs. Noise only ever
    // touches the outer edge, never the interior — keeps the fuselage solid
    // while giving a jagged, battle-worn wing edge.
    const hull = [];
    for (let t = 0; t < totalLen; t++) {
      const w = Math.max(1, widthAt(t));
      for (let i = 0; i < w; i++) {
        if (i === 0 || i < w - 1 || Math.random() > hole) hull.push([i, t]);
      }
    }
    // Interior greebles: small panel-colour accents scattered on the solid
    // part of the hull (never the edge) — surface detail the bigger canvas
    // has room for, without touching the silhouette itself.
    const greebles = [];
    for (const [i, t] of hull) {
      if (i > 0 && i < coreW - 1 && Math.random() < 0.06) greebles.push([i, t]);
    }

    const cockpitRow = cockpitSize > 0 ? noseLen + 1 : -1;

    // Twin-boom hulls carry their engines on the booms instead of the
    // centreline; everything else uses 1/2/3 centreline nozzles.
    const engineCols = hasBooms ? [] : (engineCount === 1 ? [0] : engineCount === 2 ? [1] : [0, 2]);
    const boomOffset = hasBooms ? Math.min(coreW + wingSpan + 2, MAX_HALF_WIDTH) : 0;
    const boomStart = hasBooms ? wingStart : 0;
    const boomEnd = hasBooms ? totalLen + engineLen : 0;

    // wingtip guns: a short barrel at the widest wing row, only on hulls that
    // actually have a main wing to mount them on. A delta/straight wing's
    // widest row is the root; a round bulge's widest row is the middle.
    const hasGuns = wingStyle !== "none" && wingSpan > 0 && Math.random() < gunOdds;
    const gunRow = hasGuns ? (wingStyle === "round" ? wingStart + Math.round((wingEnd - wingStart) / 2) : wingStart) : -1;
    const gunSpan = hasGuns ? Math.max(0, widthAt(gunRow) - 1) : 0;

    // wing accents: a hardpoint-style marker out near the widest part of the
    // wing (the "tip", which for a swept wing is at the root row) and a
    // second one further in where the wing rejoins the fuselage — a fighter
    // hallmark, only meaningful on a hull that actually has a flat wing.
    const hasWingAccents = (wingStyle === "delta" || wingStyle === "straight") && Math.random() < wingAccentOdds;
    const tipAccentRow = wingStart;
    const tipAccentSpan = hasWingAccents ? Math.max(0, widthAt(tipAccentRow) - 1) : 0;
    const rootAccentRow = Math.max(wingStart + 1, wingEnd - 2);
    const rootAccentSpan = hasWingAccents ? Math.max(0, widthAt(rootAccentRow) - 1) : 0;

    // a thin racing stripe down the CORE fuselage only — never the wingspan,
    // so it never reads as a shoulder-to-shoulder crossbar
    const stripeStart = noseLen + Math.max(0, Math.round(bodyLen * 0.15));
    const stripeLen = Math.round(totalLen * 0.4);

    // centre the whole nose-to-engine-tip block in the canvas regardless of
    // how long this hull class is, so a small scout isn't stranded at one
    // edge with empty space opposite it
    const blockLen = totalLen + engineLen;
    const offset = Math.max(2, Math.floor((SIZE - blockLen) / 2));

    return { totalLen, coreW, hull, greebles, cockpitRow, cockpitSize, engineCols, engineLen,
             hasGuns, gunRow, gunSpan, hasSpike, hasBooms, boomOffset, boomStart, boomEnd,
             hasWingAccents, tipAccentRow, tipAccentSpan, rootAccentRow, rootAccentSpan,
             stripeStart, stripeLen, offset };
  }

  // ---- orientations: map (lengthIndex, widthIndex) to mirrored pixel coords
  // top view: nose at the top, length runs down, mirrored left/right
  function topOrient(offset) {
    return (t, i) => [[C0 - i, offset + t], [C1 + i, offset + t]];
  }
  // side view: nose at the right, length runs left toward the tail/engines,
  // mirrored top/bottom — the same hull, viewed from the side
  function sideOrient(offset) {
    return (t, i) => [[SIZE - 1 - offset - t, C0 - i], [SIZE - 1 - offset - t, C1 + i]];
  }

  function paintHull(set, place, recipe, colors) {
    const [hullC, panelC, wingC, glowC, canopyC] = colors;
    const { hull, greebles, coreW, cockpitRow, cockpitSize, engineCols, engineLen,
             hasGuns, gunRow, gunSpan, hasSpike, hasBooms, boomOffset, boomStart, boomEnd,
             hasWingAccents, tipAccentRow, tipAccentSpan, rootAccentRow, rootAccentSpan,
             stripeStart, stripeLen, totalLen } = recipe;

    // fuselage + wings — the core band stays the hull colour even where a
    // wing extends past it, so the fuselage still reads through the wing
    for (const [i, t] of hull) {
      const c = i > coreW - 1 ? wingC : hullC;
      for (const [x, y] of place(t, i)) set(x, y, c);
    }
    for (const [i, t] of greebles) {
      for (const [x, y] of place(t, i)) set(x, y, panelC);
    }
    // thin racing stripe, clamped so it never runs past the hull's own length
    const stripeEnd = Math.min(stripeStart + stripeLen, totalLen);
    for (let t = stripeStart; t < stripeEnd; t++) {
      for (const [x, y] of place(t, 0)) set(x, y, panelC);
    }
    // cockpit canopy, just behind the nose tip
    if (cockpitRow >= 0) {
      for (let dt = 0; dt < 2; dt++) {
        for (let i = 0; i < cockpitSize; i++) {
          for (const [x, y] of place(cockpitRow + dt, i)) set(x, y, canopyC);
        }
      }
    }
    // engines: a nozzle housing plus a glowing exhaust tip past the tail
    const tailT = totalLen - 1;
    for (const off of engineCols) {
      for (let k = 0; k < engineLen; k++) {
        for (const [x, y] of place(tailT + 1 + k, off)) set(x, y, k === engineLen - 1 ? glowC : panelC);
      }
    }
    // twin booms: thin rails past each wingtip, running from the wing root
    // out past the tail, ending in their own engine glow — a silhouette no
    // centreline-engine hull has
    if (hasBooms) {
      for (let t = boomStart; t < boomEnd; t++) {
        const c = t === boomEnd - 1 ? glowC : (t >= totalLen ? panelC : hullC);
        for (const [x, y] of place(t, boomOffset)) set(x, y, c);
      }
    }
    // wingtip guns: two floating dots ahead of the widest wing row, with a
    // gap between them so they read as a detached muzzle flash/tracer
    // rather than one solid blob
    if (hasGuns) {
      for (const [x, y] of place(gunRow - 1, gunSpan)) set(x, y, panelC);
      for (const [x, y] of place(gunRow - 3, gunSpan)) set(x, y, glowC);
    }
    // wing accents: a hardpoint marker out at the wing's widest point and a
    // second one where it rejoins the fuselage — the fighter family's
    // signature detail
    if (hasWingAccents) {
      for (const [x, y] of place(tipAccentRow, tipAccentSpan)) set(x, y, canopyC);
      for (const [x, y] of place(tipAccentRow + 1, tipAccentSpan)) set(x, y, canopyC);
      for (const [x, y] of place(rootAccentRow, rootAccentSpan)) set(x, y, glowC);
    }
    // a nose spike/antenna poking out past the tip
    if (hasSpike) {
      for (const [x, y] of place(-1, 0)) set(x, y, glowC);
      for (const [x, y] of place(-2, 0)) set(x, y, glowC);
    }
  }

  function buildGridOn(orientFn, recipe, colors) {
    const grid = new Array(SIZE * SIZE).fill(null);
    const idx = (x, y) => (x >= 0 && x < SIZE && y >= 0 && y < SIZE) ? y * SIZE + x : -1;
    const set = (x, y, c) => { const i = idx(x, y); if (i >= 0) grid[i] = c; };
    paintHull(set, orientFn(recipe.offset), recipe, colors);
    outlinePass(grid, SIZE, SIZE, idx);
    return grid;
  }
  function buildGrid(recipe, colors) { return buildGridOn(topOrient, recipe, colors); }
  function buildGridSide(recipe, colors) { return buildGridOn(sideOrient, recipe, colors); }

  window.SpriteTool.ship = { W: SIZE, H: SIZE, PRESETS, PRESET_LABELS, PALETTES, makeRecipe,
                             buildGrid, buildGridSide };
})();
