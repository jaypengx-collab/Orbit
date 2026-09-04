import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob as NodeBlob } from 'node:buffer';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const indexHtml = readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');

/**
 * Loads the real index.html markup into the current jsdom document and
 * imports the real src/main.js module graph - the same entry point the
 * browser uses - so tests exercise the actual app, not a re-implementation.
 *
 * Call this once per test file: ES module state (e.g. src/state.js's
 * `state` object) is a singleton per module registry, and Vitest gives each
 * test file its own registry, so one call per file is the right granularity
 * (matching how a real page load only happens once per tab).
 *
 * localStorage must be seeded (or left empty for defaults) *before* calling
 * this, since the app reads it synchronously as part of its own boot
 * sequence (src/state.js's `applicationData: loadData()`).
 */
export async function loadApp() {
  const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/);
  document.body.innerHTML = bodyMatch[1].replace(
    /<script[^>]*src="src\/main\.js[^"]*"[^>]*>\s*<\/script>/,
    ''
  );

  // jsdom gaps vs. real browsers, patched for the test environment only
  // (not app bugs - both APIs exist and behave as used here in every real
  // browser Orbit AI targets):
  //  - jsdom's Blob doesn't implement .stream(), which the v2 backup
  //    encode/decode path relies on. Node's own global Blob does.
  window.Blob = NodeBlob;
  //  - jsdom doesn't implement scroll methods at all; the dashboard's
  //    auto-scroll-to-current-class code calls them from a
  //    requestAnimationFrame callback.
  window.Element.prototype.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  window.Element.prototype.scrollBy = () => {};

  await import('../../src/main.js');
}

export { repoRoot };
