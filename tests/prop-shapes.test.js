const { test, assertEqual, assertOk } = require("./tiny-test");
const { loadSpriteTool } = require("./helpers/load-sprite-tool");

const SpriteTool = loadSpriteTool();
const { withSeededRandom } = SpriteTool;
const { W, H, PRESET_LABELS, PALETTES, makeRecipe, buildGrid } = SpriteTool.props;

const filled = (g) => g.filter(Boolean).length;

test("props: every kind builds in every palette, inside the canvas, with an outline", () => {
  for (const kind of Object.keys(PRESET_LABELS)) for (const [name, pal] of Object.entries(PALETTES)) {
    for (let seed = 1; seed <= 20; seed++) {
      const g = buildGrid(withSeededRandom(seed, () => makeRecipe(kind)), pal);
      assertEqual(g.length, W * H);
      assertOk(filled(g) >= 30, `${kind}/${name}/${seed} looks empty (${filled(g)} px)`);
      // the outline pass needs a free border: nothing but outline on the edge rows/cols
      for (let i = 0; i < W; i++) for (const j of [i, (H - 1) * W + i, i * W, i * W + W - 1]) {
        assertOk(g[j] === null || g[j] === SpriteTool.DARK, `${kind}/${name}/${seed} touches the canvas edge`);
      }
    }
  }
});

test("props: same seed, same prop; different seeds vary", () => {
  for (const kind of Object.keys(PRESET_LABELS)) {
    const a = buildGrid(withSeededRandom(4, () => makeRecipe(kind)), PALETTES.steel);
    const b = buildGrid(withSeededRandom(4, () => makeRecipe(kind)), PALETTES.steel);
    assertEqual(a, b);
    const shapes = new Set();
    for (let s = 1; s <= 30; s++) shapes.add(JSON.stringify(buildGrid(withSeededRandom(s, () => makeRecipe(kind)), PALETTES.steel)));
    assertOk(shapes.size >= 3, `${kind}: only ${shapes.size} distinct props in 30 seeds`);
  }
});

test("props: palette slots keep their roles (a sword's blade is the metal colour family)", () => {
  const g = buildGrid(withSeededRandom(2, () => makeRecipe("sword")), PALETTES.gold);
  const [x, y] = [17, 6]; // up the blade, on the diagonal
  const near = [0, 1, -1].flatMap(d => [g[y * W + x + d], g[(y + d) * W + x]]).filter(Boolean);
  assertOk(near.some(c => /^#(e|f|d)/i.test(c)), `expected gold-ish blade pixels near ${x},${y}, got ${near}`);
});
