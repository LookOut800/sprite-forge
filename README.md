# Sprite Forge

Pixel-art tools for game makers that run entirely in the browser: hero and
ship generators with a pixel editor, a tileset generator, and Snap to Style
for turning AI renders into game sprites. No build step, no server, no
dependencies beyond one Google Fonts link.

## Tools (pages)

Every page shares the nav at the top; each is a separate HTML file.

- `index.html` — **Home**: a card per tool with live previews (`home.js`)
- `hero.html` — **Hero**: hero generator + pixel editor + game export (`app.js`, `hero-shapes.js`, `anim-export.js`)
- `ships.html` — **Ships**: ship generator + editor (`ships.js`, `ship-shapes.js`)
- `tiles.html` — **Tiles**: seamless terrain tilesets, 47 joins, Godot / Tiled export (`tiles.js`, `tile-shapes.js`)
- `snap.html` — **Snap to Style**: AI renders in, game sprites out (`snap.js`, `snap-core.js`)

Shared: `editor-core.js` (the editor engine), `style.css`.

### Hero → game

**Export for game** writes `hero.png` (a row per animation: idle, run ×8,
jump, side, back — hand-edited poses used where you made them), `hero.tres`
(a Godot 4 SpriteFrames: put it on an AnimatedSprite2D; run plays at 12 fps
and loops) and `hero.json` (the same regions, fps and loop for any engine).
Moving poses face right; flip for left. Checked by loading the `.tres` in
Godot 4.7 and reading back the pixels.

### Tiles

A library of 21 materials in four groups — Nature (dirt, grass, sand, snow,
ice, mossy stone, leaves, wood), Dungeon (stone, brick, flagstones, ruined
brick, cave, lava rock), Sci-fi (metal, tech panel, grate, hazard stripes,
circuit board), Arcane (rune stone, crystal) — at 16 or 32 px. Each
tileset is the 47-tile "blob" set — one tile for every way the 8 neighbours
can be filled, corners counted only when both sides next to them are — plus 4
variants (plain, or carrying the material's special detail: runes, vents, magma).
Every pattern repeats per tile, so any tile meets any other
without a seam. The preview paints a random cave with it.

Exports: the PNG; a Godot 4 `.tres` TileSet with one terrain set (match
corners and sides) and every tile's peering bits, so Godot's terrain tool picks
tiles itself (checked by loading it in Godot 4.7 and comparing its picks with
ours); a Tiled `.tsx` with a mixed wang set; a JSON index with each tile's
neighbour mask. Palette: the material's own, or a style preset's via the same
lock Snap to Style uses.

### Snap to Style

1. [Sprite Fusion Pixel Snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper)
   (MIT, vendored as WebAssembly in `vendor/pixel-snapper/`) finds the grid an
   AI render implies and snaps it, quantizing to N colours.
2. Our style pass (`snap-core.js`): flood out the background plate and the
   grey drop shadow, crop, scale to a fixed figure height by majority vote (no
   new colours), then lock to a palette in OKLab with a light/dark ramp per
   colour so shading survives. Accents (neons): only the strongest one per
   sprite is kept.
3. Export each PNG, or **Sheet + JSON**: one sprite sheet, figures
   bottom-aligned in equal cells, with a `frames` index.

Styles live in `presets/*.json` (`card-crawler.json` = the Card Crawler style
bible). Settings you change on the page are remembered in `localStorage`.

Snap needs the page served over http (a WebAssembly module can't load from
`file://`): GitHub Pages, or `python3 -m http.server` and open
`localhost:8000/snap.html`. Hero and Ships still open straight from disk.

## Run it locally

Open `index.html` in a browser, or run `python3 -m http.server` in this folder
for all pages (Snap needs it). Tests: `npm test` (no install needed).

## Put it on your website

Upload the whole folder to any static host, keeping the layout
(GitHub Pages, Netlify, Vercel, S3, or plain FTP to a shared host all work
the same way — there's nothing to build). Then link to `index.html`, or make
it the folder's own `index.html` if you want it at its own URL.

If you want it to live at a sub-path (e.g. `yoursite.com/sprite-forge/`),
just drop the folder in as-is — the CSS/JS references are relative, so it
doesn't matter where it's mounted.

## How it works

- **Body type + colour set** drive an auto-generator (`makeRecipe` +
  `buildGrid` in `app.js`) that builds a 16×26 pixel grid: head, torso, arms,
  legs, optional hair/horns/cape, eyes, and an outline pass.
- **Generate new** rerolls both the shape and the colours. **Reshape** keeps
  the colours and rerolls the shape. **Recolour** keeps the shape and rerolls
  the colours.
- The canvas is then a plain pixel editor: pencil, eraser, flood fill, and an
  eyedropper, with an optional left/right mirror so edits stay symmetric.
- **Gallery** saves are kept in `localStorage`, scoped to whatever domain the
  page is hosted on — they won't follow you between a local file, a staging
  URL, and your live domain, since each origin gets its own storage.
- **Open PNG** loads an image into the current frame. Pixel art (64
  colours or fewer, including your own downloads) comes in as-is and
  pixel-exact. Anything busier, like a painting or an AI render, is treated
  as a reference: cropped to the figure, fitted to the grid, and reduced to
  its own 8 main colours. A background with no transparency is dropped
  (top-left colour). An opened image has no shape data, so poses, the run
  cycle and permalinks need a fresh generate.
- **Download PNG** renders the current grid to an offscreen canvas at 16px
  per pixel and triggers a normal browser download.

## Extending it

- Add a new body shape by adding a row to `PRESETS` in `app.js`
  (`[headRx, headRy, torsoHalfWidth, torsoHeight, legLength, armLength,
  torsoHoleChance, extraOdds]`), then an entry in `PRESET_LABELS`.
- Add a new colour set by adding a 5-colour array to `PALETTES` and an
  `<option>` in `hero.html`'s `#paletteSel`.
- The generator only produces a static standing pose today. Animated frames
  (walk, jump) would need a posing step — ask if you want that ported over
  next.
