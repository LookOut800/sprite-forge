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
