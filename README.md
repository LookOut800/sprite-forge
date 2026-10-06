# Sprite Forge

A pixel-art hero generator and editor that runs entirely in the browser —
no build step, no server, no dependencies beyond one Google Fonts link.

## Files

- `index.html` — the page
- `style.css` — all styling
- `app.js` — the generator + editor logic

## Run it locally

Just open `index.html` in a browser. No server required.

## Put it on your website

Upload all three files to any static host, keeping them in the same folder
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
  `<option>` in `index.html`'s `#paletteSel`.
- The generator only produces a static standing pose today. Animated frames
  (walk, jump) would need a posing step — ask if you want that ported over
  next.
