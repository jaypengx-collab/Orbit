import { defineConfig } from 'vite';
import { copyFileSync, cpSync } from 'node:fs';

// js/app.js is still a classic (non-module) <script> today, so Vite's HTML
// pipeline won't bundle or copy it (it only processes <script type="module">
// and <link> assets). Copy it through verbatim for now; once Phase 1 turns
// it into real ES modules it will flow through Vite's normal module graph
// and get minified like css/styles.css already is. Also carry over
// .nojekyll so GitHub Pages serves the build output the same way it serves
// the repo root today.
function copyClassicScript() {
  return {
    name: 'copy-classic-script',
    closeBundle() {
      cpSync('js', 'dist/js', { recursive: true });
      copyFileSync('.nojekyll', 'dist/.nojekyll');
    }
  };
}

export default defineConfig({
  plugins: [copyClassicScript()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    // Each test file gets its own jsdom global environment so app.js's
    // top-level const/let declarations only ever run through eval once
    // per realm - required by test/helpers/loadApp.js.
    isolate: true
  }
});
