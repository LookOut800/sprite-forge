// Tileset generator — procedural terrain tiles that join up on their own.
// For one material it draws the 47-tile "blob" set (every way a tile's 8
// neighbours can be filled, once corners that can't show are ignored) plus
// a few plain fill variants, and writes the files engines read: a Godot 4
// TileSet with terrain peering bits, a Tiled .tsx with a wang set, and JSON.
// Pure functions on RGBA arrays; plain global script, attaches itself to
// window.SpriteTool.tiles (loads after editor-core.js).
(() => {
  "use strict";
  const { mulberry32 } = window.SpriteTool;

  // ---- neighbour masks --------------------------------------------------------
  // One bit per neighbour that is the same terrain.
  const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128;
  // A corner only matters when both sides next to it are filled — with
  // either side open, the open side's edge already covers that corner.
  function canonical(mask) {
    let m = mask;
    if (!(m & N) || !(m & E)) m &= ~NE;
    if (!(m & S) || !(m & E)) m &= ~SE;
    if (!(m & S) || !(m & W)) m &= ~SW;
    if (!(m & N) || !(m & W)) m &= ~NW;
    return m;
  }
  const BLOB_MASKS = [...new Set(Array.from({ length: 256 }, (_, m) => canonical(m)))].sort((a, b) => a - b);
  const VARIANTS = 4; // plain full tiles with a little detail, for variety
  const COLUMNS = 8;

  // ---- tileable noise -----------------------------------------------------------
  // Everything a material draws repeats every tile, so any tile sits next to
  // any other without a seam.
  function hash(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const mod = (a, n) => ((a % n) + n) % n;
  // value noise on a g x g lattice that wraps every tile
  function noise(x, y, T, g, seed) {
    const fx = (x / T) * g, fy = (y / T) * g;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const v = (i, j) => hash(mod(i, g), mod(j, g), seed);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  }

  // wrapped Voronoi: nearest and second-nearest of n points (repeating every
  // tile), the nearest point's index and its y. d2 - d1 small = near a border.
  function voronoi(x, y, T, n, seed) {
    let d1 = Infinity, d2 = Infinity, cell = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const px = hash(i, 1, seed) * T, py = hash(i, 2, seed) * T;
      for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) {
        const d = Math.hypot(x + 0.5 - px - ox, y + 0.5 - py - oy);
        if (d < d1) { d2 = d1; d1 = d; cell = i; cy = py + oy; } else if (d < d2) d2 = d;
      }
    }
    return { d1, d2, cell, cy };
  }

  // 5x5 glyphs for the rune stone's variant tiles
  const RUNES = [
    ["..#..", ".###.", "..#..", ".#.#.", "#...#"],
    ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
    ["###..", "#....", "###..", "..#..", "..###"],
    ["..#..", "#.#.#", ".###.", "..#..", "..#.."],
  ];
  // a small round blob of the given roles (light to dark), in a different
  // quarter of the tile for each variant
  function blobDecor(T, rng, roles, variant) {
    const m = new Map(), r = Math.max(2, Math.round(T / 6));
    const cx = Math.round(T * (0.32 + 0.36 * (variant % 2)) + (rng() - 0.5));
    const cy = Math.round(T * (0.32 + 0.36 * Math.floor(variant / 2)) + (rng() - 0.5));
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d <= 1) m.set(y * T + x, roles[Math.min(roles.length - 1, Math.floor(d * roles.length))]);
    }
    return m;
  }

  // ---- materials ------------------------------------------------------------------
  // Each material: a library `group`, colours by role, how its open edges
  // look (`cap` = a band grown on top, like grass or snow, in capDark / cap /
  // capLight; `rough` = how ragged the edge is), `fill(x, y, T, seed)` -> a
  // colour role for an interior pixel, and optionally `decorate(T, rng)` ->
  // Map(pixel index -> role) for the variant tiles, given (T, rng, variant) (default: a crack
  // and a pebble; `variant` is 0-3). Roles a material doesn't define fall back to `mid`.
  const MATERIALS = {
    stone: {
      group: "Dungeon",
      label: "Stone cobbles",
      colors: { outline: "#1b1a24", dark: "#3f3d4f", mid: "#646275", light: "#8d8aa0", hi: "#b4b1c4" },
      rough: 0,
      fill(x, y, T, seed) {
        // cobbles, with mortar where two cells nearly tie
        const { d1, d2, cell, cy } = voronoi(x, y, T, Math.max(3, Math.round(T / 4)), seed);
        if (d2 - d1 < 1.1) return "dark";
        const tone = hash(cell, 3, seed);
        if (y + 0.5 < cy - T * 0.12 && tone > 0.3) return "light"; // lit top of each cobble
        return tone < 0.25 ? "dark" : tone > 0.8 ? "light" : "mid";
      },
    },
    brick: {
      group: "Dungeon",
      label: "Brick wall",
      colors: { outline: "#1d1215", dark: "#4a3a3c", mid: "#8a3f32", light: "#b0594a", hi: "#d68a6e", shade: "#5a2b25" },
      rough: 0,
      fill(x, y, T, seed) {
        const bh = Math.max(4, T / 4), bw = T / 2;
        const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0;
        const col = Math.floor(mod(x + off, T) / bw);
        if (y % bh === bh - 1 || mod(x + off, bw) === bw - 1) return "dark"; // mortar
        const tone = hash(col, row, seed);
        if (y % bh === 0) return "light";
        return tone < 0.3 ? "shade" : "mid";
      },
    },
    dirt: {
      group: "Nature",
      label: "Dirt",
      colors: { outline: "#1a120d", dark: "#4a3020", mid: "#6e4a30", light: "#93673f", hi: "#b88a55" },
      rough: 1,
      fill(x, y, T, seed) {
        const v = noise(x, y, T, 4, seed) * 0.7 + noise(x, y, T, 8, seed + 1) * 0.3;
        const h = hash(mod(x, T), mod(y, T), seed + 7);
        if (h < 0.05) return "dark";
        if (h > 0.96) return "light";
        return v < 0.38 ? "dark" : v > 0.66 ? "light" : "mid";
      },
    },
    grass: {
      group: "Nature",
      label: "Grass on dirt",
      colors: { outline: "#14120c", dark: "#4a3020", mid: "#6e4a30", light: "#93673f", hi: "#b88a55",
                capDark: "#2f6b2a", cap: "#4f9a35", capLight: "#8ccf4a" },
      cap: 3, rough: 1,
      fill(x, y, T, seed) { return MATERIALS.dirt.fill(x, y, T, seed); },
    },
    metal: {
      group: "Sci-fi",
      label: "Metal plating",
      colors: { outline: "#111419", dark: "#2b323d", mid: "#4a5564", light: "#6c7a8c", hi: "#a6b6c8" },
      rough: 0,
      fill(x, y, T) {
        const p = T / 2, lx = x % p, ly = y % p;
        if (lx === 0 || ly === 0) return "dark";                  // panel seams
        if (ly === 1 || lx === 1) return "light";                 // lit panel edge
        const r = Math.max(2, Math.round(T / 8));
        if ((lx === r || lx === p - r) && (ly === r || ly === p - r)) return "hi"; // rivets
        return (x + y) % (T / 2) === 0 ? "light" : "mid";         // faint sheen stripe
      },
    },
    cave: {
      group: "Dungeon",
      label: "Cave rock",
      colors: { outline: "#0e0c14", dark: "#2a2433", mid: "#433a52", light: "#5f5470", hi: "#8a7ba0" },
      rough: 2,
      fill(x, y, T, seed) {
        const v = noise(x, y, T, 3, seed) * 0.6 + noise(x, y, T, 6, seed + 3) * 0.4;
        if (v > 0.74) return "light";
        if (v < 0.34) return "dark";
        return hash(mod(x, T), mod(y, T), seed + 9) > 0.97 ? "hi" : "mid";
      },
    },

    // ---- nature --------------------------------------------------------------
    sand: {
      group: "Nature", label: "Sand",
      colors: { outline: "#3a2a16", dark: "#b08a52", mid: "#d4b072", light: "#e8cb8e", hi: "#f6e2b0" },
      rough: 1,
      fill(x, y, T, seed) {
        // wind ripples: wavy rows a quarter-tile apart
        const wave = Math.floor(noise(x, 0, T, 4, seed) * 3);
        if (mod(y + wave, T / 4) === 0) return "dark";
        if (mod(y + wave, T / 4) === 1) return "light";
        return hash(mod(x, T), mod(y, T), seed + 2) > 0.95 ? "hi" : "mid";
      },
    },
    snow: {
      group: "Nature", label: "Snow on rock",
      colors: { outline: "#141826", dark: "#3b4258", mid: "#58617c", light: "#7a84a0", hi: "#a3adc6",
                capDark: "#b9cbe6", cap: "#e6effa", capLight: "#ffffff" },
      cap: 4, rough: 1,
      fill(x, y, T, seed) { return MATERIALS.cave.fill(x, y, T, seed); },
    },
    ice: {
      group: "Nature", label: "Ice",
      colors: { outline: "#13263a", dark: "#4f86b0", mid: "#7fb4d8", light: "#a9d6f0", hi: "#e6f7ff" },
      rough: 0,
      fill(x, y, T, seed) {
        const d = mod(x - y, T); // diagonal glints
        if (d === 0 || d === Math.round(T * 0.6)) return "hi";
        if (d === 1) return "light";
        const v = noise(x, y, T, 2, seed);
        return v < 0.35 ? "dark" : v > 0.7 ? "light" : "mid";
      },
    },
    moss: {
      group: "Nature", label: "Mossy stone",
      colors: { outline: "#141a14", dark: "#3c4140", mid: "#5f6662", light: "#848b85", hi: "#aab1aa",
                capDark: "#2e5a22", cap: "#4c7f2e", capLight: "#7fae46", moss: "#4c7f2e" },
      cap: 3, rough: 1,
      fill(x, y, T, seed) {
        const r = MATERIALS.stone.fill(x, y, T, seed);
        // moss creeping into the mortar
        return r === "dark" && noise(x, y, T, 4, seed + 5) > 0.55 ? "moss" : r;
      },
    },
    leaves: {
      group: "Nature", label: "Leaves / hedge",
      colors: { outline: "#0f1f12", dark: "#1f4a24", mid: "#2f6b2f", light: "#4f9a3c", hi: "#8ccf5a" },
      rough: 2,
      fill(x, y, T, seed) {
        const v = noise(x, y, T, 4, seed) * 0.6 + noise(x, y, T, 8, seed + 1) * 0.4;
        const above = noise(x, y - 1, T, 4, seed) * 0.6 + noise(x, y - 1, T, 8, seed + 1) * 0.4;
        if (v > 0.62 && above <= 0.62) return "hi";   // lit top of each clump
        return v > 0.55 ? "light" : v < 0.36 ? "dark" : "mid";
      },
    },
    wood: {
      group: "Nature", label: "Wood planks",
      colors: { outline: "#1c1009", dark: "#4d2c17", mid: "#7a4a26", light: "#9c6535", hi: "#c08a52" },
      rough: 0,
      fill(x, y, T, seed) {
        const ph = T / 4, row = Math.floor(y / ph), ly = y % ph;
        const end = Math.floor(hash(row, 4, seed) * T);          // where this plank's board ends
        if (ly === ph - 1 || mod(x - end, T) === 0) return "dark";
        if (ly === 0) return "light";
        if (mod(x - end, T) === 2 && ly === Math.floor(ph / 2)) return "hi"; // nail
        return noise(x, y * 4, T, 8, seed + row) > 0.62 ? "dark" : "mid";   // grain
      },
    },

    // ---- dungeon -------------------------------------------------------------
    flagstone: {
      group: "Dungeon", label: "Flagstones",
      colors: { outline: "#17151c", dark: "#2f2c36", mid: "#57525f", light: "#787282", hi: "#9b95a4", shade: "#4a4652" },
      rough: 0,
      fill(x, y, T, seed) {
        const sh = T / 2, row = Math.floor(y / sh), off = row % 2 ? T / 4 : 0;
        const lx = mod(x + off, sh), ly = y % sh, slab = Math.floor(mod(x + off, T) / sh);
        if (lx === sh - 1 || ly === sh - 1) return "dark";
        if (ly === 0 || lx === 0) return "light";
        const tone = hash(slab, row, seed);
        return tone < 0.35 ? "shade" : hash(mod(x, T), mod(y, T), seed + 4) > 0.94 ? "dark" : "mid";
      },
    },
    ruin: {
      group: "Dungeon", label: "Ruined brick",
      colors: { outline: "#17120f", dark: "#3e3530", mid: "#7a6a5a", light: "#9b8a74", hi: "#bba98e",
                shade: "#5e5146", moss: "#56743a" },
      rough: 1,
      fill(x, y, T, seed) {
        const bh = Math.max(4, T / 4), bw = T / 2;
        const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0, col = Math.floor(mod(x + off, T) / bw);
        const gone = hash(col, row, seed + 1) < 0.18;            // a missing brick: dark hollow
        if (y % bh === bh - 1 || mod(x + off, bw) === bw - 1) return noise(x, y, T, 4, seed) > 0.6 ? "moss" : "dark";
        if (gone) return y % bh === 0 ? "outline" : "dark";
        if (y % bh === 0) return "light";
        return hash(col, row, seed) < 0.4 ? "shade" : "mid";
      },
    },
    lava: {
      group: "Dungeon", label: "Lava rock",
      colors: { outline: "#0d0807", dark: "#231716", mid: "#3a2624", light: "#553733", hi: "#ffd36b",
                glow: "#ff7a1a", glowDark: "#c2361a" },
      rough: 2,
      fill(x, y, T, seed) {
        const { d1, d2 } = voronoi(x, y, T, Math.max(3, Math.round(T / 5)), seed);
        if (d2 - d1 < 0.8) return "glow";                           // glowing cracks
        if (d2 - d1 < 1.8) return "glowDark";
        const v = noise(x, y, T, 4, seed + 1);
        return v > 0.7 ? "light" : v < 0.35 ? "dark" : "mid";
      },
      decorate(T, rng, variant) { return blobDecor(T, rng, ["hi", "glow", "glow", "glowDark"], variant); },
    },

    // ---- sci-fi -------------------------------------------------------------
    techpanel: {
      group: "Sci-fi", label: "Tech panel",
      colors: { outline: "#0c1016", dark: "#1f2833", mid: "#34414f", light: "#4d5d6e", hi: "#7d90a4", glow: "#4ce0a0" },
      rough: 0,
      fill(x, y, T) {
        const i = Math.round(T / 8), lx = x % T, ly = y % T;
        if (lx === 0 || ly === 0) return "dark";
        if (lx === 1 || ly === 1) return "light";
        // recessed centre plate
        if (lx >= 2 * i && lx < T - 2 * i && ly >= 2 * i && ly < T - 2 * i) {
          if (ly === 2 * i || lx === 2 * i) return "dark";
          return "mid";
        }
        if (ly === T - i - 1 && lx >= T - 3 * i && lx < T - i) return "glow"; // status light
        return "light";
      },
      decorate(T, rng, variant) {
        // a vent: dark slots across the plate, across or down by variant; the
        // last two variants also get an indicator light
        const m = new Map(), lo = Math.round(T * 0.3), hi = Math.round(T * 0.7), down = variant % 2;
        for (let a = lo; a < hi; a += 2) for (let b = lo; b < hi; b++) m.set(down ? b * T + a : a * T + b, "outline");
        if (variant >= 2) m.set((hi + 1) * T + Math.round(lo + rng() * (hi - lo)), "glow");
        return m;
      },
    },
    grate: {
      group: "Sci-fi", label: "Metal grate",
      colors: { outline: "#08090c", dark: "#15181e", mid: "#4a5260", light: "#6d7889", hi: "#98a6b8" },
      rough: 0,
      fill(x, y, T) {
        const p = Math.max(4, T / 4), lx = x % p, ly = y % p;
        if (lx === 0 && ly === 0) return "hi";
        if (lx === 0 || ly === 0) return "light";
        if (lx === 1 || ly === 1) return "mid";
        return "dark";                                               // see-through holes
      },
    },
    hazard: {
      group: "Sci-fi", label: "Hazard stripes",
      colors: { outline: "#0f0e0a", dark: "#1d1c18", mid: "#e0b020", light: "#f4cf4a", hi: "#fff0a0" },
      rough: 0,
      fill(x, y, T) {
        const band = T / 4, d = mod(x + y, 2 * band);
        if (d === 0) return "light";
        return d < band ? "mid" : "dark";
      },
    },
    circuit: {
      group: "Sci-fi", label: "Circuit board",
      colors: { outline: "#05100c", dark: "#0b2219", mid: "#123627", light: "#1d4e38", hi: "#a6ffd6", glow: "#4ce0a0" },
      rough: 0,
      fill(x, y, T, seed) {
        // a few traces per tile: each runs along a row then turns down a column
        const n = Math.max(2, T / 8);
        for (let k = 0; k < n; k++) {
          const ry = Math.floor(hash(k, 6, seed) * T), cx = Math.floor(hash(k, 7, seed) * T);
          const x0 = Math.floor(hash(k, 8, seed) * T);
          const along = mod(x - x0, T) <= mod(cx - x0, T);
          if (y === ry && along) return "glow";
          if (x === cx && mod(y - ry, T) <= T / 2) return mod(y - ry, T) === T / 2 ? "hi" : "glow"; // pad at the end
        }
        return mod(x, 4) === 0 && mod(y, 4) === 0 ? "light" : "mid";
      },
    },

    // ---- arcane (ancient + neon) ------------------------------------------------
    runestone: {
      group: "Arcane", label: "Rune stone",
      colors: { outline: "#110f18", dark: "#2a2633", mid: "#47414f", light: "#625a6c", hi: "#857c90",
                shade: "#3b3643", glow: "#ff3d9a", glowDark: "#a3236a" },
      rough: 0,
      fill(x, y, T, seed) { return MATERIALS.flagstone.fill(x, y, T, seed); },
      // the variants carry the glowing glyphs, so they read as special tiles
      decorate(T, rng, variant) {
        // each variant its own glyph
        const m = new Map(), g = RUNES[variant % RUNES.length], s = Math.max(1, Math.round(T / 16));
        const ox = Math.round(T / 2 - 2.5 * s), oy = Math.round(T / 2 - 2.5 * s);
        g.forEach((row, j) => [...row].forEach((ch, i) => {
          if (ch !== "#") return;
          for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) {
            m.set((oy + j * s + b) * T + ox + i * s + a, "glow");
            m.set((oy + j * s + b + 1) * T + ox + i * s + a, m.get((oy + j * s + b + 1) * T + ox + i * s + a) || "glowDark");
          }
        }));
        return m;
      },
    },
    crystal: {
      group: "Arcane", label: "Crystal",
      colors: { outline: "#120a20", dark: "#3b2466", mid: "#6a3fa6", light: "#9a6ad6", hi: "#e2c8ff", glow: "#4ce0e0" },
      rough: 1,
      fill(x, y, T, seed) {
        const { d1, d2, cell } = voronoi(x, y, T, Math.max(3, Math.round(T / 4)), seed);
        if (d2 - d1 < 0.9) return "hi";                              // bright facet edges
        const t = hash(cell, 3, seed);
        return t < 0.3 ? "dark" : t < 0.65 ? "mid" : t < 0.9 ? "light" : "glow";
      },
    },
  };

  // Every fill sees coordinates wrapped into the tile, so a pattern can't
  // forget to repeat (and a neighbour lookup like y - 1 still lands right).
  for (const m of Object.values(MATERIALS)) {
    const fill = m.fill;
    m.fill = (x, y, T, seed) => fill(mod(x, T), mod(y, T), T, seed);
  }

  // A material from a seamless texture tile (Snap to Style's tile mode, or
  // any square image): its pixels are the fill, scaled to whatever tile
  // size is asked for; the edge roles come from its own colours, darkest to
  // brightest, so edges and corners stay in the texture's palette.
  function materialFromImage(img, label = "Custom") {
    const S = img.w, hexes = [];
    for (let i = 0; i < S * S; i++) {
      const d = img.data;
      hexes.push("#" + [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map(v => v.toString(16).padStart(2, "0")).join(""));
    }
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    const uniq = [...new Set(hexes)].sort((a, b) => lum(a) - lum(b));
    const at = (q) => uniq[Math.min(uniq.length - 1, Math.round(q * (uniq.length - 1)))];
    const n = parseInt(uniq[0].slice(1), 16), dim = (v) => Math.round(v * 0.55).toString(16).padStart(2, "0");
    return {
      group: "Custom", label, custom: true, rough: 0,
      colors: { outline: `#${dim(n >> 16)}${dim((n >> 8) & 255)}${dim(n & 255)}`, dark: at(0.15), mid: at(0.5), light: at(0.8), hi: at(1) },
      fill(x, y, T) { return hexes[Math.floor(mod(y, T) * S / T) * S + Math.floor(mod(x, T) * S / T)]; },
    };
  }

  // ---- one tile -----------------------------------------------------------------------
  // Edge-band width and corner bevel grow with the tile size.
  function renderTile(materialKey, mask, T, seed, variant = -1) {
    const mat = MATERIALS[materialKey], c = mat.colors;
    const s = T / 16, band = Math.max(1, Math.round(2 * s)), bevel = Math.max(2, Math.round(2 * s));
    const capH = mat.cap ? Math.round(mat.cap * s) : 0;
    const open = { N: !(mask & N), E: !(mask & E), S: !(mask & S), W: !(mask & W) };
    // inner corners: both sides filled, the diagonal empty
    const notch = { NE: !(mask & NE) && !open.N && !open.E, SE: !(mask & SE) && !open.S && !open.E,
                    SW: !(mask & SW) && !open.S && !open.W, NW: !(mask & NW) && !open.N && !open.W };
    // a ragged edge: how far each open edge eats in at this point along it.
    // Indexed by position along the edge so it repeats per tile and lines up
    // with the same edge on the neighbouring tile.
    const jag = (t, side) => mat.rough ? Math.floor(noise(t, side, T, Math.max(2, T / 4), seed + 11) * (mat.rough + 1)) : 0;
    const data = new Uint8ClampedArray(T * T * 4);
    const put = (x, y, hex) => {
      const n = parseInt(hex.slice(1), 16), i = (y * T + x) * 4;
      data[i] = n >> 16; data[i + 1] = (n >> 8) & 255; data[i + 2] = n & 255; data[i + 3] = 255;
    };
    // hashed, not seed + n: neighbouring seeds start mulberry32 on near-equal
    // first values, which made every variant pick the same rune
    const decor = variant < 0 ? null : (mat.decorate || decoration)(T, mulberry32(Math.floor(hash(variant, 13, seed) * 4294967296)), variant);

    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      // distance in from each open edge (Infinity = that side joins a neighbour)
      const dN = open.N ? y - jag(x, 1) : Infinity, dS = open.S ? T - 1 - y - jag(x, 2) : Infinity;
      const dW = open.W ? x - jag(y, 3) : Infinity, dE = open.E ? T - 1 - x - jag(y, 4) : Infinity;
      const dNE = notch.NE ? Math.max(y, T - 1 - x) : Infinity, dSE = notch.SE ? Math.max(T - 1 - y, T - 1 - x) : Infinity;
      const dSW = notch.SW ? Math.max(T - 1 - y, x) : Infinity, dNW = notch.NW ? Math.max(y, x) : Infinity;
      const d = Math.min(dN, dS, dW, dE, dNE, dSE, dSW, dNW);
      if (d < 0) continue;
      // bevel outer corners so lone blocks and ledges aren't hard squares
      if ((open.N && open.W && dN + dW < bevel) || (open.N && open.E && dN + dE < bevel) ||
          (open.S && open.W && dS + dW < bevel) || (open.S && open.E && dS + dE < bevel)) continue;
      // where the nearest edge faces decides cap / light / shadow
      const top = d === dN || d === dNE || d === dNW;
      const lit = top || d === dW;
      let role;
      if (d === 0) role = "outline";
      else if (capH && top && d <= capH) role = (d === 1 ? "capLight" : (x + y) % 3 === 0 ? "capDark" : "cap");
      else if (d < band + 1) role = lit ? "light" : "dark";
      else role = (decor && decor.get(y * T + x)) || mat.fill(x, y, T, seed);
      put(x, y, role[0] === "#" ? role : c[role] || c.mid); // a custom material's fill returns colours directly
    }
    // grass blades poke up past a grassy top edge into the empty tile above —
    // drawn inside this tile only, so as stray tufts on the edge rows
    if (capH && open.N) {
      for (let x = 0; x < T; x++) {
        const y = Math.max(0, jag(x, 1));
        if (hash(mod(x, T), 5, seed) > 0.72 && y > 0) put(x, y - 1, c.capLight);
      }
    }
    return { w: T, h: T, data };
  }

  // A plain tile's bit of detail: a short crack and a pebble, kept to the
  // middle so the tile still meets its neighbours exactly.
  function decoration(T, r) {
    const m = new Map(), lo = Math.round(T * 0.3), hi = Math.round(T * 0.7);
    let x = lo + Math.floor(r() * (hi - lo)), y = lo + Math.floor(r() * (hi - lo));
    for (let k = 0; k < Math.round(T / 3); k++) {
      m.set(y * T + x, "outline");
      x = Math.min(hi, Math.max(lo, x + (r() < 0.5 ? -1 : 1)));
      y = Math.min(hi, Math.max(lo, y + (r() < 0.7 ? 1 : 0)));
    }
    const px = lo + Math.floor(r() * (hi - lo)), py = lo + Math.floor(r() * (hi - lo));
    m.set(py * T + px, "hi"); m.set(py * T + px + 1, "light");
    return m;
  }

  // ---- the whole set ------------------------------------------------------------------
  // tiles[i] = { mask, variant, col, row }; the sheet is COLUMNS wide.
  function buildTileset(materialKey, T = 16, seed = 1) {
    const tiles = BLOB_MASKS.map((mask) => ({ mask, variant: -1 }));
    for (let v = 0; v < VARIANTS; v++) tiles.push({ mask: 255, variant: v });
    tiles.forEach((t, i) => { t.col = i % COLUMNS; t.row = Math.floor(i / COLUMNS); });
    const rows = Math.ceil(tiles.length / COLUMNS);
    const sheet = { w: COLUMNS * T, h: rows * T, data: new Uint8ClampedArray(COLUMNS * T * rows * T * 4) };
    for (const t of tiles) {
      const img = renderTile(materialKey, t.mask, T, seed, t.variant);
      for (let y = 0; y < T; y++) {
        sheet.data.set(img.data.subarray(y * T * 4, (y + 1) * T * 4), ((t.row * T + y) * sheet.w + t.col * T) * 4);
      }
    }
    return { sheet, tiles, tileSize: T, columns: COLUMNS };
  }

  // Which tile goes in each filled cell of a map (grid[y][x] truthy =
  // filled; off the map counts as filled, so maps run on past their edge).
  // About one in `variantEvery` fully-surrounded cells gets a variant.
  function autotile(grid, tiles, seed = 1, variantEvery = 8) {
    const H = grid.length, Wd = grid[0].length;
    const at = (x, y) => (x < 0 || y < 0 || x >= Wd || y >= H) ? true : !!grid[y][x];
    const byMask = new Map(tiles.filter(t => t.variant < 0).map((t, i) => [t.mask, i]));
    const variants = tiles.map((t, i) => [t, i]).filter(([t]) => t.variant >= 0).map(([, i]) => i);
    const out = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < Wd; x++) {
        if (!at(x, y)) { row.push(-1); continue; }
        const m = canonical((at(x, y - 1) ? N : 0) | (at(x + 1, y - 1) ? NE : 0) | (at(x + 1, y) ? E : 0) |
          (at(x + 1, y + 1) ? SE : 0) | (at(x, y + 1) ? S : 0) | (at(x - 1, y + 1) ? SW : 0) |
          (at(x - 1, y) ? W : 0) | (at(x - 1, y - 1) ? NW : 0));
        const h = hash(x, y, seed);
        row.push(m === 255 && variants.length && h < 1 / variantEvery ? variants[Math.floor(h * variantEvery * variants.length)] : byMask.get(m));
      }
      out.push(row);
    }
    return out;
  }

  // A cave-like test map: random fill, then a few smoothing passes.
  function caveMap(Wd, H, seed = 1, fill = 0.48) {
    const r = mulberry32(seed);
    let g = Array.from({ length: H }, () => Array.from({ length: Wd }, () => r() < fill));
    for (let pass = 0; pass < 4; pass++) {
      g = g.map((row, y) => row.map((_, x) => {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const yy = y + dy, xx = x + dx;
          n += (yy < 0 || xx < 0 || yy >= H || xx >= Wd) ? 1 : g[yy][xx] ? 1 : 0;
        }
        return n >= 5 || (n === 4 && g[y][x]);
      }));
    }
    return g;
  }

  // ---- engine files -------------------------------------------------------------------
  const SIDES = [[N, "top_side"], [NE, "top_right_corner"], [E, "right_side"], [SE, "bottom_right_corner"],
                 [S, "bottom_side"], [SW, "bottom_left_corner"], [W, "left_side"], [NW, "top_left_corner"]];

  // Godot 4 TileSet: one atlas, one terrain set in "match corners and
  // sides" mode, every tile tagged with the neighbours it joins. Paint with
  // the terrain tool (or set_cells_terrain_connect) and Godot picks tiles.
  // `pngName` is a path relative to the .tres (keep the two side by side).
  function godotTileSet({ tiles, tileSize }, pngName, terrainName, colorHex) {
    const [r, g, b] = [1, 3, 5].map(i => (parseInt(colorHex.slice(i, i + 2), 16) / 255).toFixed(3));
    const lines = [
      `[gd_resource type="TileSet" load_steps=3 format=3]`, ``,
      `[ext_resource type="Texture2D" path="${pngName}" id="1_tex"]`, ``,
      `[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_1"]`,
      `texture = ExtResource("1_tex")`,
      `texture_region_size = Vector2i(${tileSize}, ${tileSize})`,
    ];
    for (const t of tiles) {
      const k = `${t.col}:${t.row}/0`;
      lines.push(`${k} = 0`, `${k}/terrain_set = 0`, `${k}/terrain = 0`);
      for (const [bit, name] of SIDES) if (t.mask & bit) lines.push(`${k}/terrains_peering_bit/${name} = 0`);
      if (t.variant >= 0) lines.push(`${k}/probability = 0.15`);
    }
    lines.push(``, `[resource]`, `tile_size = Vector2i(${tileSize}, ${tileSize})`,
      `terrain_set_0/mode = 0`, `terrain_set_0/terrain_0/name = "${terrainName}"`,
      `terrain_set_0/terrain_0/color = Color(${r}, ${g}, ${b}, 1)`,
      `sources/0 = SubResource("TileSetAtlasSource_1")`, ``);
    return lines.join("\n");
  }

  // Tiled tileset with a "mixed" (corners + sides) wang set — Tiled's
  // terrain brush then picks tiles the same way.
  function tiledTsx({ tiles, tileSize, columns, sheet }, pngName, name) {
    // wangid order: top, top-right, right, bottom-right, bottom, bottom-left, left, top-left
    const wang = (m) => SIDES.map(([bit]) => (m & bit ? 1 : 0)).join(",");
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<tileset version="1.10" name="${esc(name)}" tilewidth="${tileSize}" tileheight="${tileSize}" tilecount="${tiles.length}" columns="${columns}">`,
      ` <image source="${esc(pngName)}" width="${sheet.w}" height="${sheet.h}"/>`,
      ` <wangsets>`,
      `  <wangset name="${esc(name)}" type="mixed" tile="-1">`,
      `   <wangcolor name="${esc(name)}" color="#ff0000" tile="-1" probability="1"/>`,
      ...tiles.map((t, i) => `   <wangtile tileid="${i}" wangid="${wang(t.mask)}"/>`),
      `  </wangset>`,
      ` </wangsets>`,
      `</tileset>`, ``,
    ].join("\n");
  }

  function tilesetJson({ tiles, tileSize, columns }, pngName, material) {
    return JSON.stringify({
      image: pngName, material, tileSize, columns,
      maskBits: { N, NE, E, SE, S, SW, W, NW },
      note: "mask = which of the 8 neighbours are the same terrain; corners count only when both sides next to them do",
      tiles: tiles.map((t, i) => ({ id: i, x: t.col * tileSize, y: t.row * tileSize, mask: t.mask, ...(t.variant >= 0 ? { variant: t.variant } : {}) })),
    }, null, 1);
  }

  window.SpriteTool.tiles = {
    MATERIALS, GROUPS: ["Nature", "Dungeon", "Sci-fi", "Arcane"], BLOB_MASKS, COLUMNS, MASK: { N, NE, E, SE, S, SW, W, NW },
    canonical, materialFromImage, renderTile, buildTileset, autotile, caveMap, godotTileSet, tiledTsx, tilesetJson,
  };
})();
