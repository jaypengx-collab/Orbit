import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  // The jsdom gaps this needs (Blob.stream, the scroll methods) are patched
  // for every test file in ./setupEnv.js.
  await import('../../src/main.js');
}

export { repoRoot };
