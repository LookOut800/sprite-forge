const { test, assertEqual, assertOk, assertThrows } = require("./tiny-test");
const { loadSpriteTool } = require("./helpers/load-sprite-tool");

const SpriteTool = loadSpriteTool();
const { mulberry32, withSeededRandom, shuffled, pickNoiseRuns } = SpriteTool;

test("mulberry32: deterministic for a given seed", () => {
  const a = mulberry32(12345), b = mulberry32(12345);
  assertEqual([a(), a(), a()], [b(), b(), b()]);
});

test("mulberry32: values stay within [0,1)", () => {
  const r = mulberry32(999);
  for (let i = 0; i < 200; i++) {
    const v = r();
    assertOk(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test("withSeededRandom: swaps Math.random during the call, restores it after", () => {
  const original = Math.random;
  let duringSwap;
  withSeededRandom(1, () => { duringSwap = Math.random; });
  assertOk(duringSwap !== original, "Math.random should be swapped during the call");
  assertOk(Math.random === original, "Math.random should be restored after the call");
});

test("withSeededRandom: restores Math.random even if the callback throws", () => {
  const original = Math.random;
  assertThrows(() => withSeededRandom(1, () => { throw new Error("boom"); }));
  assertOk(Math.random === original, "Math.random should still be restored after a throw");
});

test("shuffled: returns a permutation of the input (same elements, same length)", () => {
  const arr = [1, 2, 3, 4, 5];
  const s = shuffled(arr);
  assertEqual(s.length, arr.length);
  assertEqual([...s].sort(), [...arr].sort());
});

test("shuffled: does not mutate the input array", () => {
  const arr = [1, 2, 3];
  const copy = [...arr];
  shuffled(arr);
  assertEqual(arr, copy);
});

test("pickNoiseRuns: stays within bounds and roughly the requested coverage", () => {
  for (let trial = 0; trial < 20; trial++) {
    const picked = pickNoiseRuns(100, 0.2, 3);
    assertOk(picked.size <= 100, "picked more indices than exist");
    assertOk(picked.size <= 22, `picked ${picked.size}, expected around 20 (budget) plus at most one run's overshoot`);
    for (const i of picked) assertOk(i >= 0 && i < 100, `index ${i} out of bounds`);
  }
});

// ---- pixelsFromImage (PNG import) ------------------------------------------
const { pixelsFromImage } = SpriteTool;

// Builds RGBA bytes for a w×h image from a function (x,y) -> [r,g,b,a].
function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return data;
}
// Upscales a grid of "#rrggbb"/null cells by `scale`, the way Download PNG does.
function exportGrid(grid, W, H, scale) {
  return makeImage(W * scale, H * scale, (x, y) => {
    const c = grid[Math.floor(y / scale) * W + Math.floor(x / scale)];
    if (!c) return [0, 0, 0, 0];
    return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).concat(255);
  });
}

test("pixelsFromImage: an upscaled export round-trips exactly", () => {
  const W = 4, H = 3;
  const grid = ["#ff0000", null, null, "#00ff00",
                null, "#281e23", "#281e23", null,
                "#0000ff", "#ffffff", null, "#123456"];
  const { pixels, exact } = pixelsFromImage(exportGrid(grid, W, H, 16), W * 16, H * 16, W, H);
  assertOk(exact, "a few flat colours should be kept exactly");
  assertEqual(pixels, grid);
});

test("pixelsFromImage: a busy image is cropped to the figure and reduced to a few of its own colours", () => {
  // 40×40 noisy grey background (over the exact-colour limit, like a render)
  // with a 10×20 figure in its top-left area: red top half, blue bottom half
  const img = makeImage(40, 40, (x, y) => {
    const n = (x * 7 + y * 13) % 30; // 30 shades × 3 areas: well over the exact-colour limit
    if (x >= 5 && x < 15 && y >= 2 && y < 22) return y < 12 ? [200 + n, 10, 10, 255] : [10, 10, 200 + n, 255];
    return [180 + n, 180 + n, 180 + n, 255];
  });
  const { pixels, exact } = pixelsFromImage(img, 40, 40, 2, 4, 2);
  assertOk(!exact);
  const colors = [...new Set(pixels)];
  assertEqual(colors.length, 2, `expected 2 colours, got ${colors}`);
  assertOk(pixels.every(Boolean), "the cropped figure should fill the whole 2×4 grid");
  assertEqual(pixels[0], pixels[3], "top rows share a colour");
  assertEqual(pixels[4], pixels[7], "bottom rows share a colour");
  assertOk(pixels[0] !== pixels[7]);
});

test("pixelsFromImage: same image in, same colours out", () => {
  const img = makeImage(30, 30, (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 29) % 256, (x * y) % 256, 255]);
  assertEqual(pixelsFromImage(img, 30, 30, 6, 6), pixelsFromImage(img, 30, 30, 6, 6));
});

test("pixelsFromImage: a fully opaque image drops its top-left background colour", () => {
  const img = makeImage(4, 4, (x, y) => (x === 1 && y === 1 ? [9, 9, 9, 255] : [50, 60, 70, 255]));
  const { pixels } = pixelsFromImage(img, 4, 4, 4, 4);
  assertEqual(pixels.filter(Boolean), ["#090909"]);
  assertEqual(pixels[1 * 4 + 1], "#090909");
});

test("pixelsFromImage: keeps aspect ratio — a square image is centred in a tall grid", () => {
  const img = makeImage(8, 8, () => [255, 0, 0, 255]);
  img[3] = 0; // one see-through pixel, so it isn't treated as fully opaque (no background guess)
  const { pixels } = pixelsFromImage(img, 8, 8, 4, 8);
  // a 4×4 block in rows 2-5; rows 0-1 and 6-7 stay empty
  for (let y = 0; y < 8; y++) {
    const row = pixels.slice(y * 4, y * 4 + 4);
    if (y < 2 || y > 5) assertEqual(row, [null, null, null, null], `row ${y} should be empty`);
    else assertOk(row.every(c => c === "#ff0000"), `row ${y} should be filled`);
  }
});

test("pixelsFromImage: an image smaller than the grid is scaled up, not left with gaps", () => {
  const img = makeImage(2, 2, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
  const { pixels } = pixelsFromImage(img, 2, 2, 4, 4);
  for (let y = 0; y < 4; y++) assertEqual(pixels.slice(y * 4, y * 4 + 4), ["#ff0000", "#ff0000", null, null]);
});

test("pixelsFromImage: a cell under half opaque stays empty", () => {
  // each 2×2 source block maps to one cell; give the left cell 1 opaque pixel of 4
  const img = makeImage(4, 2, (x, y) => (x === 0 && y === 0 ? [0, 255, 0, 255] : x >= 2 ? [0, 0, 255, 255] : [0, 0, 0, 0]));
  const { pixels } = pixelsFromImage(img, 4, 2, 2, 1);
  assertEqual(pixels, [null, "#0000ff"]);
});
