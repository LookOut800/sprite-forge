// Home page previews: a live caped hero running its cycle, a ship and a
// tiled cave that re-roll every few seconds, drawn with the same generators the tools use,
// so the cards always show what the tools actually make today.
(() => {
  "use strict";
  const { withSeededRandom, hero, ship, tiles } = window.SpriteTool;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function draw(canvas, grid, W) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    grid.forEach((c, i) => { if (c) { ctx.fillStyle = c; ctx.fillRect(i % W, Math.floor(i / W), 1, 1); } });
  }
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // hero: a caped preset, re-rolled each time the run loop comes round 4 times
  const heroCanvas = document.getElementById("heroPreview");
  let frames = [], f = 0, loops = 0;
  function rollHero() {
    const preset = pick(["warrior", "scout", "ranger"]);
    const colors = hero.PALETTES[pick(Object.keys(hero.PALETTES))];
    const recipe = withSeededRandom(Math.floor(Math.random() * 1e9), () => hero.makeRecipe(preset));
    const front = hero.buildGrid(recipe, colors);
    frames = hero.buildRunCycleFrames(recipe, colors, front, 8);
  }
  rollHero();
  draw(heroCanvas, frames[2], hero.W);
  if (!reducedMotion) {
    setInterval(() => {
      f = (f + 1) % frames.length;
      if (f === 0 && ++loops % 4 === 0) rollHero();
      draw(heroCanvas, frames[f], hero.W);
    }, 95);
  }

  // ship: a new one every 2.5 s
  const shipCanvas = document.getElementById("shipPreview");
  shipCanvas.width = ship.W; shipCanvas.height = ship.H;
  function rollShip() {
    const preset = pick(Object.keys(ship.PRESETS));
    const colors = ship.PALETTES[pick(Object.keys(ship.PALETTES))];
    const recipe = withSeededRandom(Math.floor(Math.random() * 1e9), () => ship.makeRecipe(preset));
    draw(shipCanvas, ship.buildGrid(recipe, colors), ship.W);
  }
  rollShip();
  if (!reducedMotion) setInterval(rollShip, 2500);

  // tiles: a little cave in a new material every 3 s
  const tilesCanvas = document.getElementById("tilesPreview"), materials = Object.keys(tiles.MATERIALS);
  let m = 0;
  function rollTiles() {
    const ts = tiles.buildTileset(materials[m++ % materials.length], 16, Math.floor(Math.random() * 1e9));
    const cols = Math.floor(tilesCanvas.width / 16), rows = Math.floor(tilesCanvas.height / 16);
    const idx = tiles.autotile(tiles.caveMap(cols, rows, Math.floor(Math.random() * 1e9), 0.55), ts.tiles);
    const sheet = document.createElement("canvas");
    sheet.width = ts.sheet.w; sheet.height = ts.sheet.h;
    sheet.getContext("2d").putImageData(new ImageData(ts.sheet.data, ts.sheet.w, ts.sheet.h), 0, 0);
    const ctx = tilesCanvas.getContext("2d");
    ctx.clearRect(0, 0, tilesCanvas.width, tilesCanvas.height);
    idx.forEach((row, y) => row.forEach((i, x) => {
      if (i >= 0) ctx.drawImage(sheet, (i % ts.columns) * 16, Math.floor(i / ts.columns) * 16, 16, 16, x * 16, y * 16, 16, 16);
    }));
  }
  rollTiles();
  if (!reducedMotion) setInterval(rollTiles, 3000);
})();
