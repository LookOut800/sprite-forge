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
