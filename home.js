// Home page previews: a live caped hero running its cycle and a ship that
// re-rolls every few seconds, drawn with the same generators the tools use,
// so the cards always show what the tools actually make today.
(() => {
  "use strict";
  const { withSeededRandom, hero, ship } = window.SpriteTool;
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
})();
