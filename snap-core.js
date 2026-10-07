// Style pass for snapped sprites — the steps after Pixel Snapper has put an
// AI render onto a clean grid: drop the flat background plate, crop to the
// figure, scale it to the style's figure height, and hold its colours to the
// style's palette. Everything works on plain RGBA arrays ({w, h, data}), so
// it runs the same in the page and under `node tests/run.js`.
// Plain global script (no bundler): attaches itself to window.SnapCore, and
// to module.exports when loaded by Node.
(() => {
  "use strict";

  // ---- colour ---------------------------------------------------------------
  // OKLab: distances in it track how different two colours look, which plain
  // RGB doesn't (RGB-nearest turned a green slime tan).
  function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
  function linearToSrgb(c) {
    const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  function rgbToOklab([r, g, b]) {
    r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }
  function oklabToRgb([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
      linearToSrgb(4.0767416621 * l - 3.3077085500 * m + 0.2309667588 * s),
      linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ];
  }
  const labDist = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (c) => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");

  // ---- background -----------------------------------------------------------
  // The most common colour on the border is the plate; flood inward from the
  // border through anything within `tolerance` (OKLab distance) of it. A
  // flood rather than a global colour key, so a grey belt buckle inside the
  // figure survives. `shadowRows` = share of the figure's height (from the
  // bottom) where a grey drop shadow is also cleared; 0 keeps it.
  function removeBackground(img, tolerance = 0.06, shadowRows = 0.2) {
    const { w, h } = img, data = img.data.slice();
    const counts = new Map();
    const key = (i) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
    for (const p of border) {
      if (data[p * 4 + 3] < 128) continue;
      const k = key(p * 4);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (!counts.size) return { w, h, data }; // already transparent all round
    const plateKey = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    const plate = rgbToOklab([(plateKey >> 16) & 255, (plateKey >> 8) & 255, plateKey & 255]);
    const tol2 = tolerance * tolerance;
    const isPlate = (p) => data[p * 4 + 3] >= 128 &&
      labDist(rgbToOklab([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]), plate) <= tol2;
    const seen = new Uint8Array(w * h);
    const stack = border.filter(isPlate);
    stack.forEach(p => { seen[p] = 1; });
    flood(stack, isPlate);
    // The renders also cast a soft grey drop shadow under the feet. It isn't
    // plate-coloured, so a second flood from the cleared area takes grey
    // (low-chroma) pixels a little darker than the plate — only in the
    // bottom rows of the figure, so grey armour higher up is left alone.
    if (shadowRows > 0) {
      let top = h, bottom = -1;
      for (let p = 0; p < w * h; p++) if (data[p * 4 + 3] >= 128) { const y = (p / w) | 0; if (y < top) top = y; bottom = y; }
      const fromY = bottom - Math.ceil((bottom - top + 1) * shadowRows);
      const isShadow = (p) => {
        if (data[p * 4 + 3] < 128 || (p / w | 0) < fromY) return false;
        const lab = rgbToOklab([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);
        return Math.hypot(lab[1], lab[2]) < 0.035 && lab[0] < plate[0] && lab[0] > plate[0] - 0.4;
      };
      // plate too: a gap between the legs walled off by the shadow opens
      // up once the shadow is gone
      const clear = (p) => isPlate(p) || isShadow(p);
      const edge = [];
      for (let p = 0; p < w * h; p++) {
        if (data[p * 4 + 3] >= 128 || !seen[p]) continue;
        const x = p % w, y = (p - x) / w;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!seen[q] && clear(q)) { seen[q] = 1; edge.push(q); }
        }
      }
      flood(edge, clear);
    }
    return { w, h, data };

    function flood(stack, accept) {
      while (stack.length) {
        const p = stack.pop();
        data[p * 4 + 3] = 0;
        const x = p % w, y = (p - x) / w;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!seen[q] && accept(q)) { seen[q] = 1; stack.push(q); }
        }
      }
    }
  }

  // ---- crop + size lock -----------------------------------------------------
  function cropToContent(img) {
    const { w, h, data } = img;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return { w: 0, h: 0, data: new Uint8ClampedArray(0) };
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      out.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * cw * 4);
    }
    return { w: cw, h: ch, data: out };
  }

  // Scale so the figure is `height` pixels tall. Each output pixel takes the
  // most common colour among the source pixels it covers (a vote, never an
  // average), so no new in-between colours appear; a cell more than half
  // empty stays empty.
  function fitHeight(img, height) {
    if (!height || !img.h || img.h === height) return img;
    const s = img.h / height, ow = Math.max(1, Math.round(img.w / s)), oh = height;
    const out = new Uint8ClampedArray(ow * oh * 4);
    for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ow; ox++) {
      const sx0 = Math.floor(ox * s), sx1 = Math.max(sx0 + 1, Math.floor((ox + 1) * s));
      const sy0 = Math.floor(oy * s), sy1 = Math.max(sy0 + 1, Math.floor((oy + 1) * s));
      const votes = new Map();
      let filled = 0, total = 0, best = -1, top = 0;
      for (let y = sy0; y < Math.min(sy1, img.h); y++) for (let x = sx0; x < Math.min(sx1, img.w); x++) {
        total++;
        const i = (y * img.w + x) * 4;
        if (img.data[i + 3] < 128) continue;
        filled++;
        const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
        const c = (votes.get(k) || 0) + 1;
        votes.set(k, c);
        if (c > top) { top = c; best = k; }
      }
      if (filled * 2 <= total || best < 0) continue;
      const o = (oy * ow + ox) * 4;
      out[o] = (best >> 16) & 255; out[o + 1] = (best >> 8) & 255; out[o + 2] = best & 255; out[o + 3] = 255;
    }
    return { w: ow, h: oh, data: out };
  }

  // ---- palette lock ---------------------------------------------------------
  // A style palette lists base colours. Forcing every pixel onto those alone
  // flattens shading (a green slime has one green to land on), so each base
  // gets a ramp: `steps` darker and lighter versions at the same hue, the
  // "3-4 value steps per material" a pixel artist would paint.
  function buildRamps(baseHexes, steps = 1, stepL = 0.1) {
    const out = [];
    for (const hex of baseHexes) {
      const lab = rgbToOklab(hexToRgb(hex));
      out.push({ hex, base: hex, lab });
      for (let i = 1; i <= steps; i++) for (const dir of [-1, 1]) {
        const L = lab[0] + dir * i * stepL;
        if (L <= 0.08 || L >= 0.98) continue;
        const rgb = oklabToRgb([L, lab[1], lab[2]]);
        out.push({ hex: rgbToHex(rgb), base: hex, lab: rgbToOklab(rgb) });
      }
    }
    return out;
  }

  // Map every opaque pixel to its nearest ramp colour (OKLab). With
  // `accents` given (the style's neon list), only the accent that wins the
  // most pixels survives; pixels that went to any other accent are re-mapped
  // onto the non-accent ramps, so a sprite never ends up with two neons.
  function lockPalette(img, baseHexes, opts = {}) {
    const { steps = 1, accents = [] } = opts;
    const ramp = buildRamps(baseHexes, steps);
    const accentSet = new Set(accents.map(a => a.toLowerCase()));
    const nearest = (lab, list) => {
      let best = list[0], bd = Infinity;
      for (const c of list) { const d = labDist(lab, c.lab); if (d < bd) { bd = d; best = c; } }
      return best;
    };
    const cache = new Map(), pick = new Array(img.w * img.h);
    const accentCount = new Map();
    for (let p = 0; p < img.w * img.h; p++) {
      const i = p * 4;
      if (img.data[i + 3] < 128) continue;
      const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
      if (!cache.has(k)) cache.set(k, nearest(rgbToOklab([img.data[i], img.data[i + 1], img.data[i + 2]]), ramp));
      const c = cache.get(k);
      pick[p] = c;
      if (accentSet.has(c.base.toLowerCase())) accentCount.set(c.base, (accentCount.get(c.base) || 0) + 1);
    }
    const keep = [...accentCount].sort((a, b) => b[1] - a[1])[0];
    const muted = ramp.filter(c => !accentSet.has(c.base.toLowerCase()));
    const data = img.data.slice();
    for (let p = 0; p < pick.length; p++) {
      let c = pick[p];
      if (!c) continue;
      if (keep && accentSet.has(c.base.toLowerCase()) && c.base !== keep[0] && muted.length) {
        const i = p * 4;
        c = nearest(rgbToOklab([img.data[i], img.data[i + 1], img.data[i + 2]]), muted);
      }
      const rgb = hexToRgb(c.hex);
      data[p * 4] = rgb[0]; data[p * 4 + 1] = rgb[1]; data[p * 4 + 2] = rgb[2]; data[p * 4 + 3] = 255;
    }
    return { w: img.w, h: img.h, data };
  }

  // ---- the whole pass -------------------------------------------------------
  // `style` is a preset (presets/*.json): { height, removeBackground,
  // bgTolerance, shadowRows, palette: [hex], accents: [hex], rampSteps }.
  // Any key left out skips that step.
  function stylePass(img, style = {}) {
    let out = img;
    if (style.removeBackground !== false) out = removeBackground(out, style.bgTolerance, style.shadowRows);
    out = cropToContent(out);
    if (style.height) out = fitHeight(out, style.height);
    if (style.palette && style.palette.length) {
      out = lockPalette(out, style.palette.concat(style.accents || []), {
        steps: style.rampSteps ?? 1, accents: style.accents || [],
      });
    }
    return out;
  }

  // Pack sprites into one sheet: a row of equal cells (the largest sprite's
  // size), each sprite bottom-centred so feet line up. Returns the sheet and
  // a frames index { name: {x, y, w, h} } for the engine side.
  function packSheet(entries, gap = 1) {
    const cw = Math.max(1, ...entries.map(e => e.img.w)), ch = Math.max(1, ...entries.map(e => e.img.h));
    const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
    const rows = Math.max(1, Math.ceil(entries.length / cols));
    const W = cols * cw + (cols - 1) * gap, H = rows * ch + (rows - 1) * gap;
    const data = new Uint8ClampedArray(W * H * 4), frames = {};
    entries.forEach((e, n) => {
      const cx = (n % cols) * (cw + gap), cy = Math.floor(n / cols) * (ch + gap);
      const ox = cx + Math.floor((cw - e.img.w) / 2), oy = cy + ch - e.img.h;
      for (let y = 0; y < e.img.h; y++) {
        data.set(e.img.data.subarray(y * e.img.w * 4, (y + 1) * e.img.w * 4), ((oy + y) * W + ox) * 4);
      }
      frames[e.name] = { x: cx, y: cy, w: cw, h: ch };
    });
    return { sheet: { w: W, h: H, data }, frames, cell: { w: cw, h: ch } };
  }

  const api = {
    rgbToOklab, oklabToRgb, hexToRgb, rgbToHex,
    removeBackground, cropToContent, fitHeight, buildRamps, lockPalette, stylePass, packSheet,
  };
  if (typeof window !== "undefined") window.SnapCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
