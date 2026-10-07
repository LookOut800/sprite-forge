// Browser smoke test: serves this folder, opens every page in headless
// Chromium (Playwright) and drives each tool's main path — the things unit
// tests can't see: wiring, the WebAssembly snapper, downloads, layout.
// Fails on any page error or console error, a missing download, or a page
// that scrolls sideways at phone width.
//   node tests/browser-smoke.js        (needs Playwright + its Chromium:
//   `npm i --no-save playwright && npx playwright install chromium`, or a
//   global install)
const http = require("http");
const fs = require("fs");
const path = require("path");

function loadPlaywright() {
  try { return require("playwright"); } catch (e) { /* fall back to a global install */ }
  const root = require("child_process").execSync("npm root -g").toString().trim();
  return require(path.join(root, "playwright"));
}

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
                ".png": "image/png", ".wasm": "application/wasm" };
function serve() {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split(/[?#]/)[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

(async () => {
  const { chromium } = loadPlaywright();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const failures = [];
  let checks = 0;
  const check = (ok, what) => { checks++; if (!ok) failures.push(what); };

  async function page(name, fn) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const downloads = [];
    p.on("download", (d) => downloads.push(d.suggestedFilename()));
    try {
      await fn(p, downloads);
      await p.setViewportSize({ width: 390, height: 800 });
      await p.waitForTimeout(200);
      check(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${name}: scrolls sideways at 390px`);
    } catch (e) {
      failures.push(`${name}: ${e.message.split("\n")[0]}`);
    }
    check(errors.length === 0, `${name}: errors ${JSON.stringify(errors)}`);
    await ctx.close();
  }
  const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 60000 });

  await page("home", async (p) => {
    await p.goto(`${base}/index.html`);
    check((await p.$$(".tool-card")).length === 5, "home: expected 5 tool cards");
  });

  await page("home: old hero share link", async (p) => {
    await p.goto(`${base}/index.html#preset=warrior&palette=c64&seed=42`);
    await p.waitForURL(/hero\.html/);
  });

  await page("hero", async (p, downloads) => {
    await p.goto(`${base}/hero.html#preset=scout&palette=nebula&seed=11`);
    await p.waitForTimeout(300);
    check((await p.textContent("#seedDisplay")).trim() === "11", "hero: share link seed not loaded");
    await p.click("#genPosesBtn");
    check((await p.$$("#frameTabs button")).length >= 6, "hero: pose tabs missing");
    await p.click("#gameExportBtn");
    await p.waitForTimeout(1500); // the three files arrive one after another
    for (const f of ["hero.png", "hero.tres", "hero.json"]) check(downloads.includes(f), `hero: export missing ${f}`);
  });

  // audit regressions: undo must bring back poses; gallery loads are undoable
  await page("hero: undo keeps poses, gallery load is undoable", async (p) => {
    await p.goto(`${base}/hero.html#preset=scout&palette=nebula&seed=11`);
    await p.click("#genPosesBtn");
    await p.click("#generateBtn");
    await p.keyboard.press("Control+z");
    await p.waitForTimeout(100);
    check((await p.$$("#frameTabs button")).length >= 6, "hero: undo after Generate lost the poses");
    check((await p.textContent("#seedDisplay")).trim() === "11", "hero: undo after Generate didn't restore the seed");
    await p.click("#saveBtn");
    await p.click("#generateBtn");
    const seedBefore = (await p.textContent("#seedDisplay")).trim();
    await p.click("#galleryStrip .thumb");
    await p.keyboard.press("Control+z");
    await p.waitForTimeout(100);
    check((await p.textContent("#seedDisplay")).trim() === seedBefore, "hero: a gallery load couldn't be undone");
  });

  await page("hero: a Random-preset share link reproduces the sprite", async (p) => {
    await p.goto(`${base}/hero.html`);
    await p.selectOption("#presetSel", "random");
    await p.selectOption("#paletteSel", "toxic");
    await p.click("#generateBtn");
    await p.waitForTimeout(100);
    const url = p.url(), pixels = await p.$eval("#pixels", c => c.toDataURL());
    await p.selectOption("#paletteSel", "candy"); // changing the select afterwards mustn't change the link
    const p2 = await p.context().newPage();
    await p2.goto(url);
    await p2.waitForTimeout(300);
    check(await p2.$eval("#pixels", c => c.toDataURL()) === pixels, "hero: share link built a different sprite");
  });

  await page("ships", async (p) => {
    await p.goto(`${base}/ships.html`);
    await p.click("#generateBtn");
  });

  await page("props: Random kind", async (p) => {
    await p.goto(`${base}/props.html`);
    await p.selectOption("#presetSel", "random");
    check((await p.$$(".variation")).length === 12, "props: Random kind gave no variations");
    await p.click("#moreBtn");
  });

  await page("props", async (p) => {
    await p.goto(`${base}/props.html`);
    await p.selectOption("#presetSel", "chest");
    check((await p.$$(".variation")).length === 12, "props: expected 12 variations");
    const seed = (await p.getAttribute(".variation:nth-child(3)", "title")).replace("Seed ", "");
    await p.click(".variation:nth-child(3)");
    check((await p.textContent("#seedDisplay")).trim() === seed, "props: clicked variation didn't load its seed");
  });

  await page("tiles", async (p, downloads) => {
    await p.goto(`${base}/tiles.html`);
    await until(p, () => document.querySelectorAll(".lib-item").length >= 20);
    await p.click('.lib-item[data-material="lava"]');
    check((await p.textContent("#pickedName")) === "Lava rock", "tiles: picking a material didn't select it");
    await p.click("#godotBtn");
    await p.waitForTimeout(500);
    check(downloads.some(f => f.endsWith(".tres")) && downloads.some(f => f.endsWith(".png")), "tiles: Godot export missing files");
  });

  await page("snap: sprites", async (p, downloads) => {
    await p.goto(`${base}/snap.html`);
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.selectOption("#presetSel", "card-crawler");
    await p.waitForTimeout(300);
    // the same file twice: two sprites, and the sheet must keep both
    const goblin = path.join(__dirname, "fixtures/render-goblin.png");
    await p.setInputFiles("#fileInput", [goblin]);
    await p.setInputFiles("#fileInput", [goblin]);
    await until(p, () => [...document.querySelectorAll(".snap-row figcaption")].filter(f => f.textContent.startsWith("styled")).length === 2);
    check((await p.textContent(".snap-row")).includes("×64"), "snap: styled sprite isn't 64px tall");
    const [json] = await Promise.all([p.waitForEvent("download", { predicate: d => d.suggestedFilename() === "sheet.json" }), p.click("#sheetBtn")]);
    const frames = JSON.parse(fs.readFileSync(await json.path(), "utf8")).frames;
    check(Object.keys(frames).length === 2, `snap: sheet.json lists ${Object.keys(frames).length} frames for 2 sprites`);
    check(downloads.includes("sheet.png"), "snap: sheet export missing sheet.png");
    await p.click(".snap-remove");
    check((await p.$$(".snap-row")).length === 1, "snap: remove didn't remove the row");
    await p.click("#clearBtn");
    check((await p.$$(".snap-row")).length === 0, "snap: Clear all left rows");
  });

  await page("snap: texture tile -> tileset", async (p) => {
    await p.goto(`${base}/snap.html`);
    await p.selectOption("#modeSel", "tile");
    await p.setInputFiles("#fileInput", [path.join(__dirname, "fixtures/texture-wall.png")]);
    await until(p, () => document.querySelector(".snap-row button.primary"));
    await Promise.all([p.waitForURL(/tiles\.html#material=custom-/), p.click(".snap-row button.primary")]);
    await until(p, () => document.querySelector("#pickedName") && document.querySelector("#pickedName").textContent === "texture-wall");
    check((await p.$$eval(".lib-group", e => e.map(x => x.textContent))).includes("Custom"), "snap->tiles: no Custom group");
  });

  await browser.close();
  server.close();
  if (failures.length) {
    console.log(`browser smoke: ${failures.length} failed of ${checks}`);
    for (const f of failures) console.log("  ✗ " + f);
    process.exit(1);
  }
  console.log(`browser smoke: ${checks} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
