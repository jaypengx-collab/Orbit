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
