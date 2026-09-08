// Test-environment gaps, patched once for every test file (wired up as
// vite.config.js's `setupFiles`) rather than inside loadApp() - tests that
// exercise src/ modules directly, without booting the whole app, need the
// same globals.
//
// None of these are app bugs: every API below exists and behaves as used
// here in every real browser Orbit AI targets. They're missing from jsdom,
// or from the VM realm the fast pool runs test files in.
import { Blob as NodeBlob } from 'node:buffer';
import { CompressionStream, DecompressionStream } from 'node:stream/web';

// The v2 backup format's gzip encode/decode pipeline (editor-backup.js).
// A VM realm doesn't inherit these from the host the way the default pool's
// context does, so they're pulled in from node:stream/web by name.
globalThis.CompressionStream = CompressionStream;
globalThis.DecompressionStream = DecompressionStream;

// jsdom's own Blob has no .stream(), which that same pipeline reads from.
globalThis.Blob = NodeBlob;

// jsdom doesn't implement the scroll methods at all; the dashboard's
// auto-scroll-to-current-class code calls them from a requestAnimationFrame
// callback.
Element.prototype.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
Element.prototype.scrollBy = () => {};
