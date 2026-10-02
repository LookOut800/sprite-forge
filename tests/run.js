// Runs every tests/*.test.js file (each registers and immediately executes
// its own tests at require-time) and prints one pass/fail summary.
// `node tests/run.js` or `npm test` — zero dependencies either way.
const fs = require("fs");
const path = require("path");
const { summary } = require("./tiny-test");

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.js")).sort();
for (const f of files) require(path.join(dir, f));
summary();
