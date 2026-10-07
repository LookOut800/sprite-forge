// Loads the plain-global Sprite Forge scripts into a fresh fake `window` —
// the same way hero.html/ships.html load them via <script> tags, just
// without a browser. Clears the require cache each call so tests don't
// leak state between files (every call gets its own fresh SpriteTool).
function loadSpriteTool() {
  const fakeWindow = {};
  const realWindow = global.window, realDocument = global.document;
  global.window = fakeWindow;
  global.document = { createElement: () => ({}) };
  const files = ["../../editor-core.js", "../../hero-shapes.js", "../../ship-shapes.js", "../../tile-shapes.js", "../../anim-export.js"];
  try {
    for (const f of files) {
      const resolved = require.resolve(f);
      delete require.cache[resolved];
      require(resolved);
    }
  } finally {
    global.window = realWindow;
    global.document = realDocument;
  }
  return fakeWindow.SpriteTool;
}

module.exports = { loadSpriteTool };
