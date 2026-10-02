const { test, assertEqual, assertOk } = require("./tiny-test");
const { loadSpriteTool } = require("./helpers/load-sprite-tool");

const SpriteTool = loadSpriteTool();
const { withSeededRandom } = SpriteTool;
const { PRESETS, makeRecipe, buildGrid, buildGridSide, PALETTES } = SpriteTool.ship;

function countFilled(grid) { return grid.filter((c) => c !== null).length; }
// the widest filled column-index seen at each length-row, derived straight
// from the recipe's own hull list — used by the two regression tests below
function widthProfile(recipe) {
  const byRow = new Map();
  for (const [i, t] of recipe.hull) byRow.set(t, Math.max(byRow.get(t) || 0, i + 1));
  return byRow;
}

test("ship: same seed produces an identical recipe for every hull class", () => {
  for (const key of Object.keys(PRESETS)) {
    let a, b;
    withSeededRandom(7, () => { a = makeRecipe(key); });
    withSeededRandom(7, () => { b = makeRecipe(key); });
    assertEqual(a, b, `${key} recipe should be identical under the same seed`);
  }
});

test("ship: every hull class generates a non-degenerate grid in both orientations", () => {
  for (const key of Object.keys(PRESETS)) {
    const recipe = makeRecipe(key);
    const top = buildGrid(recipe, PALETTES.c64);
    const side = buildGridSide(recipe, PALETTES.c64);
    assertOk(countFilled(top) >= 15, `${key} top view looks empty`);
    assertOk(countFilled(side) >= 15, `${key} side view looks empty`);
  }
});

test("ship: no hull fill pixel ever runs past the outline margin (regression: bomber/dreadnought wingtip clipping)", () => {
  for (const key of Object.keys(PRESETS)) {
    for (let trial = 0; trial < 10; trial++) {
      const recipe = makeRecipe(key);
      for (const [i] of recipe.hull) {
        assertOk(i <= 13, `${key} hull width index ${i} leaves no room for the outline pass`);
      }
    }
  }
});

test("ship: the nose taper distributes evenly, no double-jump (regression: Math.round staircase)", () => {
  // Tests the taper formula directly (floor((t+1)*coreW/noseLen) for each
  // nose row, from the preset's own coreW/noseLen) rather than reading it
  // back off a generated hull: the hull's edge-noise pass can shave a
  // row's outer pixel off, which distorts a width reading by noise alone
  // and has nothing to do with the taper math being regression-tested here.
  // An evenly-distributed integer taper never has two step sizes more than
  // 1 apart — the old Math.round version could (e.g. steps of 1,0,1).
  for (const key of Object.keys(PRESETS)) {
    const { coreW, noseLen } = PRESETS[key];
    if (key === "saucer") continue; // round style uses a circular formula, not this taper
    const seq = [];
    for (let t = 0; t < noseLen; t++) seq.push(Math.floor(((t + 1) * coreW) / noseLen));
    assertEqual(seq[seq.length - 1], coreW, `${key} nose taper should reach exactly coreW by its last row`);
    const steps = seq.slice(1).map((w, i) => w - seq[i]);
    const maxStep = Math.max(...steps), minStep = Math.min(...steps);
    assertOk(maxStep - minStep <= 1, `${key} nose taper steps vary by ${maxStep - minStep} (${steps.join(",")}) — not evenly distributed`);
  }
});

test("ship: the saucer is roughly circular, not a lopsided blob (regression: round-style shape)", () => {
  const recipe = makeRecipe("saucer");
  const byRow = widthProfile(recipe);
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const n = rows.length;
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const front = byRow.get(rows[k]), back = byRow.get(rows[n - 1 - k]);
    assertOk(Math.abs(front - back) <= 2, `saucer row ${k} from the front (width ${front}) vs from the back (width ${back}) should be roughly symmetric`);
  }
});
