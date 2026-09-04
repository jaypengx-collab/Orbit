import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';

// .nojekyll has to ride along in the build output so GitHub Pages serves
// dist/ the same way it serves the repo root today.
function copyNojekyll() {
  return {
    name: 'copy-nojekyll',
    closeBundle() {
      copyFileSync('.nojekyll', 'dist/.nojekyll');
    }
  };
}

export default defineConfig({
  // Relative, not absolute ('/'): this site deploys to
  // https://jaypengx-collab.github.io/Orbit/ - a subpath, not domain root.
  // Vite's default base emits asset URLs like "/assets/x.js", which under a
  // subpath deploy resolve to the wrong place (domain root instead of
  // /Orbit/) and 404, leaving the page stuck on its boot spinner forever
  // since the module that would clear it never loads. base: './' emits
  // "./assets/x.js" instead, which resolves correctly under any subpath.
  base: './',
  plugins: [copyNojekyll()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    // Each test file gets its own jsdom global environment - required by
    // test/helpers/loadApp.js, which imports the real src/main.js module
    // graph once per file.
    isolate: true
  }
});
