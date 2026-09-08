import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', '**/node_modules/**']
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Injected at build time by vite.config.js's `define` - see
        // testsim-runtime.js's only use of them.
        __APP_VERSION_DATE__: 'readonly',
        __APP_VERSION_HASH__: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      // src/ is all const/let ES modules now (testsim-runtime.js was the last
      // `var` holdout). These two keep it that way rather than leaving it to
      // whoever reviews the next patch.
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  {
    files: ['src/**/*.test.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly'
      }
    }
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    // A classic (non-module) service worker script - self/caches/fetch/
    // Response/URL are its own global scope, not the page's window.
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.serviceworker
      }
    }
  },
  {
    // The Gemini proxy Cloudflare Worker: a separate, server-side deployable
    // (pasted into the Cloudflare dashboard or deployed with Wrangler - see
    // README), not part of the app's src/ ES module graph. Its global scope
    // (fetch/Response/Request/URL as ambient globals, an ES module with a
    // default export) matches the service-worker environment closely enough
    // to reuse those globals here.
    files: ['cloudflare-worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.serviceworker
      }
    }
  }
];
