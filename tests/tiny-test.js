// A minimal, dependency-free test harness. Node's built-in `node:test`
// needs Node 18+; this project targets "works anywhere, no build step, no
// npm install" for the app itself, and the test suite follows the same
// rule — `node tests/run.js` runs on any Node version, nothing to install.
let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
  }
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(message || `expected ${e}, got ${a}`);
}
function assertOk(value, message) {
  if (!value) throw new Error(message || `expected a truthy value, got ${value}`);
}
function assertThrows(fn, message) {
  try { fn(); } catch (e) { return; }
  throw new Error(message || "expected function to throw");
}

function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { test, assertEqual, assertOk, assertThrows, summary };
