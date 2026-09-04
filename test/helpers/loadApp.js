import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob as NodeBlob } from 'node:buffer';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const indexHtml = readFileSync(path.join(repoRoot, 'index.html'), 'utf-8');
const appJsSource = readFileSync(path.join(repoRoot, 'js', 'app.js'), 'utf-8');

/**
 * Loads the real, unmodified index.html markup into the current jsdom
 * document and evaluates the real, unmodified js/app.js in the global scope
 * (indirect eval, so top-level `function` declarations attach to `window`
 * exactly like a classic `<script>` tag does in a real browser).
 *
 * Call this once per test file (top-level `const`/`let` in app.js can only
 * be declared once per realm - Vitest gives each test file its own jsdom
 * global environment, so one call per file is the right granularity).
 *
 * localStorage must be seeded (or left empty for defaults) *before* calling
 * this, since app.js reads it synchronously as part of its own boot sequence.
 */
export function loadApp() {
  const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/);
  document.body.innerHTML = bodyMatch[1].replace(
    /<script[^>]*src="js\/app\.js[^"]*"[^>]*>\s*<\/script>/,
    ''
  );

  // jsdom gaps vs. real browsers, patched for the test environment only
  // (not app.js bugs - both APIs exist and behave as used here in every
  // real browser Orbit AI targets):
  //  - jsdom's Blob doesn't implement .stream(), which the v2 backup
  //    encode/decode path relies on. Node's own global Blob does.
  window.Blob = NodeBlob;
  //  - jsdom doesn't implement scroll methods at all; the dashboard's
  //    auto-scroll-to-current-class code calls them from a
  //    requestAnimationFrame callback.
  window.Element.prototype.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  window.Element.prototype.scrollBy = () => {};

  // Indirect eval runs in the global scope, matching classic-script semantics:
  // top-level `function` declarations become window properties, top-level
  // `const`/`let` become global lexical bindings (not window properties,
  // same as in a real browser - so unlike window.MANUALLY_TEST and friends,
  // they aren't independently readable from outside this one eval call).
  // Appending a small bridge in the *same* eval call closes over those
  // bindings correctly, since it runs in the same top-level scope app.js's
  // own later code does.
  (0, eval)(
    appJsSource +
      '\nwindow.__orbitTest = { getViewDay: () => viewDay, getApplicationData: () => applicationData };\n'
  );
}

export { repoRoot };
