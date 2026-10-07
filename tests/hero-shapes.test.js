const { test, assertEqual, assertOk } = require("./tiny-test");
const { loadSpriteTool } = require("./helpers/load-sprite-tool");

const SpriteTool = loadSpriteTool();
const { withSeededRandom } = SpriteTool;
const { W, H, PRESETS, makeRecipe, buildGrid, buildGridBack, buildGridProfile,
        buildGridJump, buildRunCycleFrames, PALETTES } = SpriteTool.hero;

function countFilled(grid) { return grid.filter((c) => c !== null).length; }

test("hero: same seed produces an identical recipe for every preset", () => {
  for (const key of Object.keys(PRESETS)) {
    let a, b;
    withSeededRandom(42, () => { a = makeRecipe(key); });
    withSeededRandom(42, () => { b = makeRecipe(key); });
    assertEqual(a, b, `${key} recipe should be identical under the same seed`);
  }
});

test("hero: varying the seed varies the recipe", () => {
  let first, sawDifference = false;
  for (let seed = 0; seed < 20; seed++) {
    let r;
    withSeededRandom(seed, () => { r = JSON.stringify(makeRecipe("warrior")); });
    if (seed === 0) first = r;
    else if (r !== first) sawDifference = true;
  }
  assertOk(sawDifference, "varying the seed should change the recipe at least once across 20 tries");
});

test("hero: every preset generates a non-degenerate front grid", () => {
  for (const key of Object.keys(PRESETS)) {
    const recipe = makeRecipe(key);
    const grid = buildGrid(recipe, PALETTES.c64);
    assertEqual(grid.length, W * H, `${key} grid should be W*H cells`);
    assertOk(countFilled(grid) >= 10, `${key} front grid looks empty`);
  }
});

test("hero: every preset generates valid back/side/jump poses and an 8-frame run cycle", () => {
  for (const key of Object.keys(PRESETS)) {
    const recipe = makeRecipe(key);
    const front = buildGrid(recipe, PALETTES.c64);
    const back = buildGridBack(recipe, PALETTES.c64, front);
    const side = buildGridProfile(recipe, PALETTES.c64, front, 0);
    const jumpR = buildGridJump(recipe, PALETTES.c64, front, 1);
    const jumpL = buildGridJump(recipe, PALETTES.c64, front, -1);
    for (const [name, g] of [["back", back], ["side", side], ["jumpR", jumpR], ["jumpL", jumpL]]) {
      assertOk(countFilled(g) >= 10, `${key} ${name} pose looks empty`);
    }
    const cycle = buildRunCycleFrames(recipe, PALETTES.c64, front, 8);
    assertEqual(cycle.length, 8, `${key} run cycle should have 8 frames`);
    cycle.forEach((g, i) => assertOk(countFilled(g) >= 10, `${key} run-cycle frame ${i} looks empty`));
  }
});

// ---- the cape in motion ----------------------------------------------------
function capedRecipe(capeDir) {
  const r = withSeededRandom(3, () => makeRecipe("warrior"));
  return { ...r, capeDir };
}
// cells left of the head's back edge (x < 7 - hwid) at or above the neck —
// where a right-facing pose's trailing cape lives
function trailCells(grid, recipe) {
  const ttop = 24 - recipe.leg + 1 - recipe.th, cells = [];
  for (let y = 0; y < ttop + 3; y++) for (let x = 0; x < 7 - recipe.hwid; x++) if (grid[y * W + x]) cells.push(`${x},${y}`);
  return cells.join(" ");
}

test("cape: the run cycle's cape ripples (not every frame the same)", () => {
  const r = capedRecipe(1), front = buildGrid(r, PALETTES.c64);
  const tails = new Set(buildRunCycleFrames(r, PALETTES.c64, front, 8).map(g => trailCells(g, r)));
  assertOk(tails.size >= 3, `expected the tail to move between frames, got ${tails.size} distinct shapes`);
});

test("cape: trails behind whichever side the front streamer was on", () => {
  for (const dir of [1, -1]) {
    const r = capedRecipe(dir), front = buildGrid(r, PALETTES.c64);
    assertOk(trailCells(buildGridProfile(r, PALETTES.c64, front, 1, Math.PI / 2), r).length > 0, `capeDir ${dir}: no tail behind`);
  }
});

test("cape: no cape, no tail", () => {
  const r = capedRecipe(0), front = buildGrid(r, PALETTES.c64);
  const frames = buildRunCycleFrames(r, PALETTES.c64, front, 8);
  assertEqual(new Set(frames.map(g => trailCells(g, r))).size, 1, "a cape-less hero's back edge shouldn't flutter");
});

test("cape: a hand-painted pixel over the streamer survives into the side view", () => {
  const r = capedRecipe(1), front = buildGrid(r, PALETTES.c64);
  const noCape = buildGrid({ ...r, capeDir: 0 }, PALETTES.c64);
  const i = front.findIndex((c, k) => c !== noCape[k] && c !== null);
  const painted = front.slice(); painted[i] = "#123456";
  assertEqual(buildGridProfile(r, PALETTES.c64, painted, 0)[i], "#123456");
});
