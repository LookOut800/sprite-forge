const { test, assertEqual, assertOk } = require("./tiny-test");
const { loadSpriteTool } = require("./helpers/load-sprite-tool");

const SpriteTool = loadSpriteTool();
const { hero, anim, withSeededRandom } = SpriteTool;

function setup() {
  const recipe = withSeededRandom(5, () => hero.makeRecipe("scout"));
  const colors = hero.PALETTES.c64, front = hero.buildGrid(recipe, colors);
  return { recipe, colors, front };
}

test("anim: a generated hero exports idle, run x8, jump, side, back", () => {
  const { recipe, colors, front } = setup();
  const anims = anim.heroAnimations(hero, recipe, colors, { front });
  assertEqual(anims.map(a => `${a.name}:${a.frames.length}`), ["idle:1", "run:8", "jump:1", "side:1", "back:1"]);
});

test("anim: a hand-edited pose is used instead of a regenerated one", () => {
  const { recipe, colors, front } = setup();
  const side = hero.buildGridProfile(recipe, colors, front, 0).slice(); side[0] = "#123456";
  const anims = anim.heroAnimations(hero, recipe, colors, { front, side });
  assertEqual(anims.find(a => a.name === "side").frames[0][0], "#123456");
});

test("anim: without a recipe only the frames that exist are exported", () => {
  const { front } = setup();
  assertEqual(anim.heroAnimations(hero, null, null, { front }).map(a => a.name), ["idle"]);
});

test("anim: packing puts each animation on its own row, frames where the regions say", () => {
  const { recipe, colors, front } = setup();
  const anims = anim.heroAnimations(hero, recipe, colors, { front });
  const p = anim.packAnimations(anims, hero.W, hero.H);
  assertEqual([p.w, p.h], [8 * hero.W, 5 * hero.H]);
  const r = p.regions.run[3], f = anims[1].frames[3];
  for (let y = 0; y < hero.H; y++) for (let x = 0; x < hero.W; x++) {
    if (p.grid[(r.y + y) * p.w + r.x + x] !== f[y * hero.W + x]) throw new Error(`run frame 3 misplaced at ${x},${y}`);
  }
});

test("anim: Godot SpriteFrames has a region per frame and each animation's speed/loop", () => {
  const { recipe, colors, front } = setup();
  const anims = anim.heroAnimations(hero, recipe, colors, { front });
  const tres = anim.godotSpriteFrames(anims, anim.packAnimations(anims, hero.W, hero.H), "hero.png");
  assertOk(tres.startsWith('[gd_resource type="SpriteFrames" load_steps=14 format=3]'));
  assertEqual((tres.match(/\[sub_resource type="AtlasTexture"/g) || []).length, 12);
  assertOk(tres.includes('"name": &"run",\n"speed": 12.0'));
  assertOk(tres.includes('"loop": false,\n"name": &"jump"'));
});
