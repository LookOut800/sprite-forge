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
    await p.waitForTimeout(500);
    for (const f of ["hero.png", "hero.tres", "hero.json"]) check(downloads.includes(f), `hero: export missing ${f}`);
  });

  await page("ships", async (p) => {
    await p.goto(`${base}/ships.html`);
    await p.click("#generateBtn");
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
    await p.setInputFiles("#fileInput", [path.join(__dirname, "fixtures/render-goblin.png")]);
    await until(p, () => document.querySelectorAll(".snap-row button").length === 1);
    check((await p.textContent(".snap-row")).includes("styled") && (await p.textContent(".snap-row")).includes("×64"), "snap: styled sprite isn't 64px tall");
    await p.click("#sheetBtn");
    await p.waitForTimeout(800);
    check(downloads.includes("sheet.png") && downloads.includes("sheet.json"), "snap: sheet export missing files");
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
