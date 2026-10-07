const { test, assertEqual, assertOk } = require("./tiny-test");
const SnapCore = require("../snap-core.js");
const { removeBackground, cropToContent, fitHeight, buildRamps, lockPalette, stylePass, packSheet, hexToRgb } = SnapCore;

// w x h image filled with `fill`, then each [x, y, hex] in `paint` set
function img(w, h, fill, paint = []) {
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, hex) => {
    const [r, g, b] = hexToRgb(hex), i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, fill);
  for (const [x, y, hex] of paint) put(x, y, hex);
  return { w, h, data };
}
const alpha = (im, x, y) => im.data[(y * im.w + x) * 4 + 3];
const hexAt = (im, x, y) => SnapCore.rgbToHex([...im.data.slice((y * im.w + x) * 4, (y * im.w + x) * 4 + 3)]);

// a 2x3 red figure in the middle of a light-grey plate
const FIG = [];
for (let y = 2; y < 5; y++) for (let x = 3; x < 5; x++) FIG.push([x, y, "#c03030"]);

test("removeBackground: clears the plate, keeps the figure", () => {
  const out = removeBackground(img(8, 8, "#d8d8d8", FIG), 0.06, 0);
  assertEqual(alpha(out, 0, 0), 0);
  assertEqual(alpha(out, 3, 2), 255);
});

test("removeBackground: plate-coloured pixels enclosed by the figure survive", () => {
  const ring = [];
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) ring.push([x, y, (x === 3 && y === 3) ? "#d8d8d8" : "#202020"]);
  const out = removeBackground(img(7, 7, "#d8d8d8", ring), 0.06, 0);
  assertEqual(alpha(out, 3, 3), 255, "the enclosed grey pixel is part of the figure");
});

test("removeBackground: drops a grey shadow under the figure, not grey higher up", () => {
  const paint = [];
  for (let y = 0; y < 8; y++) for (let x = 3; x < 6; x++) paint.push([x, y + 1, y === 2 ? "#909090" : "#7a4b32"]);
  for (let x = 1; x < 8; x++) paint.push([x, 9, "#a8a8a8"]); // the shadow row
  const out = removeBackground(img(9, 11, "#d8d8d8", paint), 0.06, 0.2);
  assertEqual(alpha(out, 1, 9), 0, "shadow cleared");
  assertEqual(alpha(out, 4, 3), 255, "grey band in the figure kept");
});

test("cropToContent: trims to the opaque box", () => {
  const out = cropToContent(removeBackground(img(8, 8, "#d8d8d8", FIG), 0.06, 0));
  assertEqual([out.w, out.h], [2, 3]);
});

test("fitHeight: scales to the height and invents no new colours", () => {
  const paint = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) paint.push([x, y, y < 4 ? "#ff0000" : "#0000ff"]);
  const out = fitHeight(img(4, 8, "#ff0000", paint), 4);
  assertEqual([out.w, out.h], [2, 4]);
  assertEqual(hexAt(out, 0, 0), "#ff0000");
  assertEqual(hexAt(out, 0, 3), "#0000ff");
});

test("buildRamps: each base gets darker and lighter steps", () => {
  const r = buildRamps(["#4CE0A0"], 1);
  assertEqual(r.length, 3);
  assertOk(r.every(c => c.base === "#4CE0A0"));
});

test("lockPalette: a green keeps a green, not the closest-RGB tan", () => {
  const out = lockPalette(img(1, 1, "#80e050"), ["#C9A876", "#4CE0A0"]);
  const [r, g, b] = out.data;
  assertOk(g > r && g > b, `expected a green, got ${hexAt(out, 0, 0)}`);
});

test("lockPalette: only the strongest accent survives", () => {
  const paint = [[0, 0, "#ff7a1a"], [1, 0, "#ff3d9a"]];
  const out = lockPalette(img(3, 1, "#ff7a1a", paint), ["#3C4650", "#FF7A1A", "#FF3D9A"], { accents: ["#FF7A1A", "#FF3D9A"] });
  const neonPink = buildRamps(["#FF3D9A"]).map(c => c.hex.toLowerCase());
  assertOk(!neonPink.includes(hexAt(out, 1, 0)), "the magenta pixel was moved off the magenta ramp");
});

test("stylePass: background, crop, height in one go", () => {
  const out = stylePass(img(8, 8, "#d8d8d8", FIG), { height: 6, shadowRows: 0 });
  assertEqual(out.h, 6);
  assertEqual(out.w, 4);
});

test("packSheet: frames index covers every sprite, feet aligned to the cell bottom", () => {
  const a = img(2, 4, "#ff0000"), b = img(3, 2, "#00ff00");
  const { sheet, frames, cell } = packSheet([{ name: "a", img: a }, { name: "b", img: b }]);
  assertEqual(cell, { w: 3, h: 4 });
  assertEqual(Object.keys(frames), ["a", "b"]);
  assertEqual(alpha(sheet, frames.b.x + 1, cell.h - 1), 255, "b sits on the bottom row");
  assertEqual(alpha(sheet, frames.b.x + 1, 0), 0, "and leaves the top empty");
});
