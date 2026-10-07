const { test, assertEqual, assertOk } = require("./tiny-test");
const { loadSpriteTool } = require("./helpers/load-sprite-tool");

const { tiles } = loadSpriteTool();
const { MATERIALS, BLOB_MASKS, MASK, canonical, renderTile, buildTileset, autotile, caveMap, godotTileSet, tiledTsx, tilesetJson } = tiles;
const { N, E, S, W, NE, SE, NW } = MASK;

const opaque = (img, x, y) => img.data[(y * img.w + x) * 4 + 3] > 0;
const px = (img, x, y) => Array.from(img.data.slice((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)).join(",");

test("tiles: the blob set has 47 distinct joins", () => {
  assertEqual(BLOB_MASKS.length, 47);
  assertOk(BLOB_MASKS.includes(0) && BLOB_MASKS.includes(255));
});

test("tiles: a corner without both of its sides is dropped", () => {
  assertEqual(canonical(N | NE), N);
  assertEqual(canonical(N | E | NE), N | E | NE);
});

test("tiles: every material builds a full sheet at 16 and 32", () => {
  for (const m of Object.keys(MATERIALS)) for (const T of [16, 32]) {
    const ts = buildTileset(m, T, 3);
    assertEqual(ts.tiles.length, 51, `${m} ${T}`);
    assertEqual(ts.sheet.w, 8 * T);
    assertEqual(ts.sheet.h, 7 * T);
  }
});

test("tiles: a fully surrounded tile is solid; a lone tile has open, bevelled corners", () => {
  for (const m of Object.keys(MATERIALS)) {
    const full = renderTile(m, 255, 16, 3);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) assertOk(opaque(full, x, y), `${m} full tile has a hole at ${x},${y}`);
    const lone = renderTile(m, 0, 16, 3);
    assertOk(!opaque(lone, 0, 0), `${m} lone tile corner should be cut`);
    assertOk(opaque(lone, 8, 8), `${m} lone tile should have a middle`);
  }
});

test("tiles: two full tiles meet seamlessly (each pattern repeats per tile)", () => {
  // the column just right of a tile's last column is the next tile's first —
  // for a seamless pattern, row by row, the fill function is periodic, so
  // checking the full tile's left column against a re-render shifted by T is
  // the same as checking left/right edges continue
  for (const m of Object.keys(MATERIALS)) {
    const fill = MATERIALS[m].fill;
    for (let y = 0; y < 16; y++) {
      assertEqual(fill(16, y, 16, 3), fill(0, y, 16, 3), `${m}: column 16 should repeat column 0 at row ${y}`);
      assertEqual(fill(y, 16, 16, 3), fill(y, 0, 16, 3), `${m}: row 16 should repeat row 0 at col ${y}`);
    }
  }
});

test("tiles: same seed, same tileset", () => {
  const a = buildTileset("cave", 16, 9), b = buildTileset("cave", 16, 9);
  assertEqual(px(a.sheet, 20, 20), px(b.sheet, 20, 20));
  assertOk(Buffer.from(a.sheet.data).equals(Buffer.from(b.sheet.data)));
});

test("autotile: picks the tile whose mask matches each cell's neighbours", () => {
  const ts = buildTileset("stone", 16, 1);
  const grid = [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ];
  const idx = autotile(grid, ts.tiles, 1, Infinity);
  assertEqual(idx[0][0], -1);
  assertEqual(ts.tiles[idx[1][1]].mask, E | S | SE);
  assertEqual(ts.tiles[idx[2][2]].mask, N | W | NW);
});

test("autotile: every cell of a cave map gets a tile", () => {
  const ts = buildTileset("dirt", 16, 1), map = caveMap(30, 16, 4);
  const idx = autotile(map, ts.tiles, 4);
  map.forEach((row, y) => row.forEach((f, x) => assertOk(f ? idx[y][x] >= 0 : idx[y][x] === -1, `cell ${x},${y}`)));
});

test("godot: one tile entry per tile, peering bits from its mask", () => {
  const ts = buildTileset("brick", 16, 1);
  const tres = godotTileSet(ts, "brick.png", "Brick", "#8a3f32");
  assertOk(tres.startsWith('[gd_resource type="TileSet"'));
  assertEqual((tres.match(/\/terrain = 0/g) || []).length, 51);
  const lone = ts.tiles.findIndex(t => t.mask === 0), full = ts.tiles.findIndex(t => t.mask === 255 && t.variant < 0);
  const bits = (i) => (tres.match(new RegExp(`^${ts.tiles[i].col}:${ts.tiles[i].row}/0/terrains_peering_bit/`, "gm")) || []).length;
  assertEqual(bits(lone), 0);
  assertEqual(bits(full), 8);
});

test("tiled + json: one entry per tile", () => {
  const ts = buildTileset("metal", 32, 1);
  assertEqual((tiledTsx(ts, "m.png", "Metal").match(/<wangtile /g) || []).length, 51);
  assertEqual(JSON.parse(tilesetJson(ts, "m.png", "metal")).tiles.length, 51);
});

test("library: every material sits in a known group and builds its variants", () => {
  for (const [key, m] of Object.entries(MATERIALS)) {
    assertOk(tiles.GROUPS.includes(m.group), `${key} has no known group`);
    const plain = Buffer.from(renderTile(key, 255, 16, 3).data).toString("base64");
    const variants = [0, 1, 2, 3].map(i => Buffer.from(renderTile(key, 255, 16, 3, i).data).toString("base64"));
    assertOk(!variants.includes(plain), `${key}: a variant looks the same as the plain tile`);
    assertEqual(new Set(variants).size, 4, `${key}: the 4 variants should all differ`);
  }
  assertOk(Object.keys(MATERIALS).length >= 20, "the library should have 20+ materials");
});
