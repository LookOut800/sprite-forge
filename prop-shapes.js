// Prop / item generator — weapons, potions, chests, keys, gems, books… as
// 24x24 icons. A prop is drawn in MATERIALS first (metal, wood, accent,
// trim, paper, plus a few tones), then coloured from the palette with light
// from the top-left (a highlight where the shape's edge faces up/left, a
// shade where it faces down/right) and outlined. Long items (blades, axes,
// keys) lie on the diagonal, bottom-left to top-right, the classic RPG icon
// pose. Same contract as hero/ship-shapes: makeRecipe(kind) uses only
// Math.random (so the editor's seeding makes it repeatable) and
// buildGrid(recipe, colors) returns a W*H grid of "#rrggbb" | null.
(() => {
  "use strict";
  const { outlinePass } = window.SpriteTool;
  const W = 24, H = 24;

  // Palette slots mean something here: [metal, wood, accent, trim, paper].
  const PALETTES = {
    steel:    ["#9AA4B4", "#7A4B2A", "#D8443A", "#E0B040", "#EFE3C2"],
    gold:     ["#E8C25A", "#5E3A24", "#3FA0E0", "#FFF1A0", "#F2E6C8"],
    bronze:   ["#C07A3A", "#4A3020", "#3C9A6A", "#E0A860", "#E6D5B0"],
    obsidian: ["#3A3348", "#2A2230", "#A65CFF", "#8A7AA8", "#D8CCE8"],
    elven:    ["#CFD8DC", "#8A6A3A", "#4CE07A", "#B8E0C0", "#F0F4E8"],
    ember:    ["#5A4A48", "#3A2418", "#FF7A1A", "#FFB040", "#F0DCC0"],
    frost:    ["#A9D6F0", "#4A5A70", "#E6F7FF", "#6FB0E0", "#F0F8FF"],
    outlaw:   ["#3C4650", "#7A4B32", "#4CE0A0", "#C9A876", "#E9DDC7"], // Card Crawler's style bible
  };
  const SLOT = { metal: 0, wood: 1, accent: 2, trim: 3, paper: 4 };

  const PRESET_LABELS = {
    sword: "Sword", dagger: "Dagger", axe: "Axe", hammer: "Hammer", spear: "Spear", staff: "Staff",
    shield: "Shield", helmet: "Helmet", potion: "Potion", chest: "Chest", key: "Key", gem: "Gem",
    coin: "Coin", ring: "Ring", book: "Book", scroll: "Scroll",
  };
  const PRESETS = Object.fromEntries(Object.keys(PRESET_LABELS).map(k => [k, {}]));

  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1)); // integer in [a, b]
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // ---- recipes: every random choice, independent of colour -----------------
  function makeRecipe(kind) {
    const r = { kind };
    switch (kind) {
      case "sword":
        Object.assign(r, { blade: R(9, 12), bladeW: pick([0.5, 1]), grip: R(3, 4), guard: pick([1.5, 2, 2.5]), gem: Math.random() < 0.5, fuller: Math.random() < 0.5 });
        break;
      case "dagger":
        Object.assign(r, { blade: R(6, 8), bladeW: pick([0.5, 1]), grip: R(2, 3), guard: pick([1, 1.5]), gem: Math.random() < 0.3, fuller: false });
        break;
      case "axe":
        Object.assign(r, { handle: R(14, 16), head: pick([[2, 3, 4, 4, 3], [3, 4, 4, 3], [2, 4, 5, 5, 4, 2]]), spike: Math.random() < 0.5 });
        break;
      case "hammer":
        Object.assign(r, { handle: R(13, 15), headLen: R(4, 5), headW: pick([2, 2.5, 3]), band: Math.random() < 0.6 });
        break;
      case "spear":
        Object.assign(r, { handle: R(13, 15), tip: pick([[1, 1.5, 1, 0.5, 0], [1, 1, 0.5, 0], [1.5, 1.5, 1, 0.5, 0]]), tassel: Math.random() < 0.6 }); // handle + tip <= 20 steps, so it stays off the edge
        break;
      case "staff":
        Object.assign(r, { handle: R(9, 11), orb: R(2, 3), prongs: Math.random() < 0.6 }); // orb stays inside the canvas
        break;
      case "shield":
        Object.assign(r, { shape: pick(["heater", "round", "kite"]), field: pick(["metal", "wood", "accent"]), emblem: pick(["cross", "stripe", "boss", "chevron"]) });
        break;
      case "helmet":
        Object.assign(r, { dome: R(7, 8), visor: pick(["slit", "t", "open"]), plume: Math.random() < 0.5, horns: Math.random() < 0.25 });
        break;
      case "potion":
        Object.assign(r, { body: pick(["round", "flask", "tall"]), fill: R(45, 75) / 100, bubbles: Math.random() < 0.6 });
        break;
      case "chest":
        Object.assign(r, { width: R(15, 18), bands: R(1, 2), lid: pick(["round", "flat"]) });
        break;
      case "key":
        Object.assign(r, { shaft: R(9, 11), bow: pick([2, 2.5, 3]), teeth: R(1, 3), gem: Math.random() < 0.4 });
        break;
      case "gem":
        Object.assign(r, { cut: pick(["diamond", "oval", "hex", "heart"]), size: R(6, 8) });
        break;
      case "coin":
        Object.assign(r, { stack: Math.random() < 0.35, mark: pick(["star", "crown", "dot"]) });
        break;
      case "ring":
        Object.assign(r, { band: R(5, 6), stone: pick(["diamond", "round"]) });
        break;
      case "book":
        Object.assign(r, { thick: R(3, 4), emblem: pick(["eye", "star", "bar"]), clasp: Math.random() < 0.6 });
        break;
      case "scroll":
        Object.assign(r, { len: R(12, 16), ribbon: Math.random() < 0.6, lines: R(2, 3) });
        break;
    }
    return r;
  }

  // ---- drawing in materials ---------------------------------------------------
  function canvas() {
    const m = new Array(W * H).fill(null);
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const set = (x, y, mat) => { x = Math.round(x); y = Math.round(y); if (inb(x, y)) m[y * W + x] = mat; };
    const get = (x, y) => inb(x, y) ? m[y * W + x] : null;
    return { m, set, get };
  }
  // Pixels along a straight axis: `segs` = [{ len, wl, wr, mat }] from the
  // base outward; wl / wr = half-widths left / right of the axis (in half
  // steps, so 0 = a 1px line, 0.5 = 2-3px). axis "diag" runs from (x0, y0)
  // up-right on a 1:1 staircase; "up" runs straight up from (x0, y0).
  function profile(c, segs, axis, x0, y0) {
    const total = segs.reduce((n, s) => n + s.len, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let t, q;
      if (axis === "diag") { const a = x - x0, b = y0 - y; t = (a + b) / 2; q = (a - b) / 2; }
      else { t = y0 - y; q = x - x0; }
      if (t < 0 || t >= total) continue;
      let at = Math.floor(t), seg = null;
      for (const s of segs) { if (at < s.len) { seg = s; break; } at -= s.len; }
      if (seg && q >= -seg.wl && q <= seg.wr) c.set(x, y, seg.mat);
    }
    return total;
  }
  // where step t of a diagonal from (x0, y0) lands
  const diagAt = (x0, y0, t) => [x0 + t, y0 - t];
  function disc(c, cx, cy, rx, ry, mat, ring = 0) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1 && (!ring || ((x - cx) / (rx - ring)) ** 2 + ((y - cy) / (ry - ring)) ** 2 > 1)) c.set(x, y, mat);
    }
  }
  function rect(c, x0, y0, x1, y1, mat) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.set(x, y, mat); }

  const DRAW = {
    sword(c, r) {
      const x0 = 3, y0 = 20;
      const tip = [{ len: 1, wl: r.bladeW / 2, wr: r.bladeW / 2, mat: "metal" }, { len: 1, wl: 0, wr: 0, mat: "metal" }];
      const segs = [
        { len: 1, wl: 0.5, wr: 0.5, mat: "trim" },                      // pommel
        { len: r.grip, wl: 0, wr: 0, mat: "wood" },                      // grip
        { len: 1, wl: r.guard, wr: r.guard, mat: "trim" },               // crossguard
        { len: r.blade - 2, wl: r.bladeW, wr: r.bladeW, mat: "metal" },  // blade
        ...tip,
      ];
      profile(c, segs, "diag", x0, y0);
      const g = 1 + r.grip;
      if (r.gem) c.set(...diagAt(x0, y0, g), "accent");
      if (r.fuller) for (let t = g + 2; t < g + r.blade - 2; t++) c.set(...diagAt(x0, y0, t), "metalDark");
    },
    dagger(c, r) { DRAW.sword(c, r); },
    axe(c, r) {
      const x0 = 4, y0 = 20;
      profile(c, [{ len: r.handle, wl: 0, wr: 0, mat: "wood" }], "diag", x0, y0);
      const start = r.handle - r.head.length - 1;
      profile(c, [{ len: start, wl: -99, wr: -99, mat: null }, ...r.head.map(w => ({ len: 1, wl: r.spike ? 1 : 0, wr: w, mat: "metal" }))], "diag", x0, y0);
      for (let i = 0; i < r.head.length; i++) { // the cutting edge
        const [x, y] = diagAt(x0, y0, start + i);
        const w = r.head[i];
        c.set(x + Math.ceil(w), y + Math.floor(w), "metalLight");
      }
    },
    hammer(c, r) {
      const x0 = 4, y0 = 20;
      profile(c, [{ len: r.handle, wl: 0, wr: 0, mat: "wood" }], "diag", x0, y0);
      const start = r.handle - r.headLen;
      profile(c, [{ len: start, wl: -99, wr: -99, mat: null }, { len: r.headLen, wl: r.headW, wr: r.headW, mat: "metal" }], "diag", x0, y0);
      if (r.band) profile(c, [{ len: start + 1, wl: -99, wr: -99, mat: null }, { len: 1, wl: r.headW, wr: r.headW, mat: "trim" }], "diag", x0, y0);
    },
    spear(c, r) {
      const x0 = 2, y0 = 21;
      profile(c, [{ len: r.handle, wl: 0, wr: 0, mat: "wood" }, ...r.tip.map(w => ({ len: 1, wl: w, wr: w, mat: "metal" }))], "diag", x0, y0);
      if (r.tassel) { const [x, y] = diagAt(x0, y0, r.handle - 1); c.set(x - 1, y + 1, "accent"); c.set(x - 1, y + 2, "accent"); c.set(x, y + 2, "accentDark"); }
    },
    staff(c, r) {
      const x0 = 4, y0 = 20;
      profile(c, [{ len: 1, wl: 0.5, wr: 0.5, mat: "trim" }, { len: r.handle, wl: 0.5, wr: 0.5, mat: "wood" }], "diag", x0, y0);
      const [ox, oy] = diagAt(x0, y0, r.handle + r.orb);
      if (r.prongs) { c.set(ox - r.orb - 1, oy, "trim"); c.set(ox, oy + r.orb + 1, "trim"); c.set(ox - r.orb, oy + 1, "trim"); c.set(ox - 1, oy + r.orb, "trim"); }
      disc(c, ox, oy, r.orb + 0.5, r.orb + 0.5, "accent");
      c.set(ox - 1, oy - 1, "hi");
    },
    shield(c, r) {
      const cx = 11.5, top = 3;
      const halfAt = (y) => {
        const u = (y - top) / 17;
        if (r.shape === "round") return Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) * 8.5;
        if (r.shape === "kite") return u < 0.3 ? 6 + u * 8 : 8.4 * (1 - (u - 0.3) / 0.7) + 0.5;
        return u < 0.55 ? 8 : 8 * Math.sqrt(Math.max(0, 1 - ((u - 0.55) / 0.45) ** 2)); // heater
      };
      for (let y = top; y <= top + 17; y++) {
        const h = halfAt(y);
        for (let x = 0; x < W; x++) {
          const d = Math.abs(x - cx);
          if (d > h) continue;
          const rim = d > h - 1.2 || y === top || (r.shape === "round" && y === top + 17);
          c.set(x, y, rim ? "trim" : r.field);
        }
      }
      const em = r.field === "accent" ? "trim" : "accent";
      if (r.emblem === "cross") { rect(c, 11, top + 3, 12, top + 13, em); rect(c, 7, top + 6, 16, top + 7, em); }
      if (r.emblem === "stripe") for (let y = top + 2; y <= top + 15; y++) for (let k = 0; k < 2; k++) if (halfAt(y) - 1.5 > Math.abs(y - top - 2 - 8 + k)) c.set(4 + (y - top) + k - 2, y, em);
      if (r.emblem === "boss") { disc(c, cx, top + 8, 3, 3, em); c.set(10, top + 6, "hi"); }
      if (r.emblem === "chevron") for (let i = 0; i < 5; i++) { c.set(cx - 0.5 - i, top + 5 + i, em); c.set(cx + 0.5 + i, top + 5 + i, em); c.set(cx - 0.5 - i, top + 6 + i, em); c.set(cx + 0.5 + i, top + 6 + i, em); }
    },
    helmet(c, r) {
      const cx = 11.5, cy = 13;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = ((x - cx) / r.dome) ** 2 + ((y - cy) / r.dome) ** 2;
        if (d <= 1 && y <= cy + 6) c.set(x, y, "metal");
      }
      rect(c, Math.round(cx - r.dome), cy + 1, Math.round(cx + r.dome) - 1, cy + 1, "trim");   // brow band
      if (r.visor === "slit") rect(c, 7, cy + 3, 16, cy + 3, "dark");
      if (r.visor === "t") { rect(c, 7, cy + 3, 16, cy + 3, "dark"); rect(c, 11, cy + 3, 12, cy + 6, "dark"); }
      if (r.visor === "open") rect(c, 8, cy + 3, 15, cy + 6, "dark");
      if (r.plume) { // a crest sweeping back over the dome
        for (let i = 0; i < 7; i++) {
          const x = 10 + i, top = cy - r.dome - 2 + Math.round(Math.abs(i - 2) * 0.6);
          for (let y = top; y <= cy - r.dome + 1 + (i > 3 ? 1 : 0); y++) c.set(x, y, y === top ? "accentLight" : "accent");
        }
      }
      if (r.horns) for (let i = 0; i < 4; i++) { c.set(cx - r.dome - i + 0.5, cy - 2 - i, "paper"); c.set(cx + r.dome + i - 0.5, cy - 2 - i, "paper"); }
    },
    potion(c, r) {
      const cx = 11.5;
      rect(c, 10, 2, 13, 3, "wood");                                   // cork
      rect(c, 10, 4, 13, 6, "glass");                                  // neck
      let body;
      if (r.body === "round") body = (x, y) => ((x - cx) / 7) ** 2 + ((y - 14) / 7) ** 2 <= 1;
      else if (r.body === "flask") body = (x, y) => y >= 7 && y <= 20 && Math.abs(x - cx) <= 1.5 + (y - 7) * 0.5;
      else body = (x, y) => y >= 7 && y <= 20 && Math.abs(x - cx) <= 4.5;
      let y0 = H, y1 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (body(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const surface = Math.round(y1 - (y1 - y0) * r.fill);
      for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) {
        if (!body(x, y)) continue;
        c.set(x, y, y === surface ? "accentLight" : y > surface ? "accent" : "glass");
      }
      c.set(cx - 3.5, y0 + 2, "hi"); c.set(cx - 3.5, y0 + 3, "hi"); c.set(cx - 2.5, y0 + 1, "hi");
      if (r.bubbles) { c.set(cx + 1.5, surface + 2, "accentLight"); c.set(cx - 0.5, surface + 4, "accentLight"); }
    },
    chest(c, r) {
      const x0 = Math.round(12 - r.width / 2), x1 = x0 + r.width - 1;
      if (r.lid === "round") for (let y = 5; y <= 9; y++) for (let x = x0; x <= x1; x++) {
        const u = (x - (x0 + x1) / 2) / ((x1 - x0) / 2);
        if (y >= 9 - Math.round(4 * Math.sqrt(Math.max(0, 1 - u * u)))) c.set(x, y, "wood");
      }
      else rect(c, x0, 7, x1, 9, "wood");
      rect(c, x0, 10, x1, 10, "dark");                                 // lid seam
      rect(c, x0, 11, x1, 19, "wood");
      const bandXs = r.bands === 1 ? [x0 + 2, x1 - 2] : [x0 + 2, Math.round((x0 + x1) / 2) - 3, Math.round((x0 + x1) / 2) + 3, x1 - 2];
      for (const bx of bandXs) for (let y = 4; y <= 19; y++) if (c.get(bx, y)) c.set(bx, y, "metal");
      rect(c, 11, 9, 12, 12, "trim"); c.set(11, 11, "dark");           // lock + keyhole
    },
    key(c, r) {
      const x0 = 4, y0 = 19;
      disc(c, x0, y0, r.bow + 0.5, r.bow + 0.5, "trim", 1.2);          // the bow, a ring
      if (r.gem) c.set(x0, y0, "accent");
      const sx = x0 + Math.ceil(r.bow * 0.7), sy = y0 - Math.ceil(r.bow * 0.7);
      profile(c, [{ len: r.shaft, wl: 0, wr: 0, mat: "trim" }], "diag", sx, sy);
      for (let i = 0; i < r.teeth; i++) {
        const [x, y] = diagAt(sx, sy, r.shaft - 1 - i * 2);
        c.set(x + 1, y + 1, "trim"); c.set(x + 2, y + 1, "trim");
      }
    },
    gem(c, r) {
      const cx = 11.5, cy = 12, s = r.size;
      const inside = {
        diamond: (x, y) => Math.abs(x - cx) / s + Math.abs(y - cy) / (s * 1.2) <= 1,
        oval: (x, y) => ((x - cx) / (s * 0.8)) ** 2 + ((y - cy) / s) ** 2 <= 1,
        hex: (x, y) => Math.abs(y - cy) <= s * 0.9 && Math.abs(x - cx) <= s - Math.abs(y - cy) * 0.5,
        heart: (x, y) => { const u = (x - cx) / s, v = (cy - y) / s; return (u * u + v * v - 0.5) ** 3 - u * u * v * v * v <= 0.02; },
      }[r.cut];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!inside(x, y)) continue;
        const facet = y < cy - s * 0.3 ? "accentLight" : (x - cx) > (y - cy) * 0.6 ? "accentDark" : "accent";
        c.set(x, y, facet);
      }
      c.set(cx - 2.5, cy - s * 0.5, "hi"); c.set(cx - 1.5, cy - s * 0.5 - 1, "hi");
    },
    coin(c, r) {
      const one = (cx, cy) => {
        disc(c, cx, cy, 7, 7, "trim");
        disc(c, cx, cy, 5.2, 5.2, "trimDark", 1);
        if (r.mark === "dot") disc(c, cx, cy, 1.6, 1.6, "trimDark");
        if (r.mark === "star") { for (let i = -2; i <= 2; i++) { c.set(cx + i, cy, "trimDark"); c.set(cx, cy + i, "trimDark"); } c.set(cx - 1, cy - 1, "trimDark"); c.set(cx + 1, cy + 1, "trimDark"); c.set(cx + 1, cy - 1, "trimDark"); c.set(cx - 1, cy + 1, "trimDark"); }
        if (r.mark === "crown") { rect(c, cx - 2, cy, cx + 2, cy + 1, "trimDark"); c.set(cx - 2, cy - 1, "trimDark"); c.set(cx, cy - 2, "trimDark"); c.set(cx + 2, cy - 1, "trimDark"); }
      };
      if (r.stack) { one(14, 10); one(9, 14); } // a second coin behind the first
      else one(12, 12);
    },
    ring(c, r) {
      const cx = 11.5, cy = 14;
      disc(c, cx, cy, r.band + 0.5, r.band, "trim", 1.6);
      if (r.stone === "diamond") { for (let i = 0; i < 3; i++) for (let k = -i; k <= i; k++) c.set(cx + k, cy - r.band - 3 + i, "accent"); rect(c, cx - 2, cy - r.band, cx + 2, cy - r.band, "accentDark"); }
      else disc(c, cx, cy - r.band - 1, 2.6, 2.2, "accent");
      c.set(cx - 1, cy - r.band - 2, "hi");
    },
    book(c, r) {
      rect(c, 5, 4, 18, 19, "accent");                                 // cover
      rect(c, 5, 4, 6, 19, "accentDark");                              // spine
      rect(c, 7, 20, 18, 19 + Math.min(1, r.thick - 3) + 1, "paper");  // page edge
      rect(c, 18, 5, 18, 19, "paper");
      if (r.emblem === "star") { for (let i = -2; i <= 2; i++) { c.set(12 + i, 11, "trim"); c.set(12, 11 + i, "trim"); } }
      if (r.emblem === "eye") { rect(c, 10, 11, 14, 11, "trim"); c.set(12, 10, "trim"); c.set(12, 12, "trim"); c.set(12, 11, "dark"); }
      if (r.emblem === "bar") { rect(c, 9, 8, 15, 8, "trim"); rect(c, 9, 14, 15, 14, "trim"); }
      if (r.clasp) rect(c, 17, 10, 19, 12, "trim");
    },
    scroll(c, r) {
      const x0 = Math.round(12 - r.len / 2), x1 = x0 + r.len - 1;
      rect(c, x0 + 1, 7, x1 - 1, 16, "paper");
      for (const x of [x0, x1]) { rect(c, x, 6, x, 17, "wood"); c.set(x, 5, "trim"); c.set(x, 18, "trim"); }
      for (let i = 0; i < r.lines; i++) rect(c, x0 + 3, 9 + i * 2, x1 - 3 - (i === r.lines - 1 ? 3 : 0), 9 + i * 2, "paperDark");
      if (r.ribbon) { rect(c, 11, 7, 12, 16, "accent"); c.set(11, 17, "accent"); c.set(12, 18, "accentDark"); }
    },
  };

  // ---- colour -----------------------------------------------------------------
  const mix = (hex, to, t) => {
    const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return "#" + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, "0")).join("");
  };
  // a material name -> its palette base colour (before edge light/shade)
  function baseColor(mat, colors) {
    const [name, tone] = mat.match(/^([a-z]+?)(Dark|Light)?$/).slice(1);
    if (mat === "hi") return "#FFFFFF";
    if (mat === "dark") return mix(colors[SLOT.metal], "#000000", 0.75);
    if (mat === "glass") return mix(colors[SLOT.paper], "#9fd4ff", 0.25);
    const base = colors[SLOT[name]] || colors[0];
    return tone === "Dark" ? mix(base, "#000000", 0.35) : tone === "Light" ? mix(base, "#FFFFFF", 0.4) : base;
  }

  function buildGrid(recipe, colors) {
    const c = canvas();
    DRAW[recipe.kind](c, recipe);
    const grid = new Array(W * H).fill(null);
    const idx = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? y * W + x : -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const mat = c.get(x, y);
      if (!mat) continue;
      let col = baseColor(mat, colors);
      if (mat !== "hi" && mat !== "dark") {
        // light from the top-left: lit where the silhouette's edge faces up
        // or left, shaded where it faces down or right
        if (!c.get(x, y - 1) || !c.get(x - 1, y)) col = mix(col, "#FFFFFF", 0.3);
        else if (!c.get(x, y + 1) || !c.get(x + 1, y)) col = mix(col, "#000000", 0.3);
      }
      grid[y * W + x] = col;
    }
    outlinePass(grid, W, H, idx);
    return grid;
  }

  window.SpriteTool.props = { W, H, PRESETS, PRESET_LABELS, PALETTES, makeRecipe, buildGrid };
})();
