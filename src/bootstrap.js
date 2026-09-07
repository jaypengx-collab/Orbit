// ---- src/bootstrap.js ----
// Boot sequence: load settings, build the schedule, start the per-second
// clock. Runs once every other module has finished defining its functions -
// see main.js for why import order matters here.
import { setStyleMode } from './appearance.js';
import { syncTestToolbar } from './dashboard.js';
import { mainClockTick, syncTestPlayPauseUi } from './dashboard-render.js';
import { getDefaultData, loadData, saveData } from './data.js';
import { buildSchedule } from './schedule.js';
import { state } from './state.js';
import { renderSyncPanel, startSyncLoop } from './sync.js';

// ---- js/bootstrap.js ----
// Runs once every module below has finished defining its functions: loads saved
// settings, builds the runtime schedule from them, applies the saved theme, and
// starts the live clock that drives the dashboard.
// (state.applicationData is set here, not in state.js's own initial value -
// see the comment on state.js for why.)
state.applicationData = loadData();
// Every step below is guarded: main.js imports this module before
// testsim-runtime.js, whose init() is what actually clears the boot spinner
// (see its finishBoot()). Since these run as plain top-level statements, an
// uncaught throw in any one of them would abort this module's evaluation and,
// with it, the rest of the static import chain - testsim-runtime.js would
// simply never run, leaving the app stuck behind the spinner forever. A
// malformed/unexpectedly-shaped saved schedule (e.g. carried over from an
// older version of the app) is exactly the kind of thing that could trip up
// buildSchedule() or the dashboard's first render in a way loadData()'s own
// validation didn't anticipate, so this falls back to a clean default
// schedule rather than ever letting that happen.
try {
  buildSchedule();
} catch (error) {
  console.error(
    'Orbit AI: buildSchedule() failed on the saved schedule, resetting to defaults.',
    error
  );
  state.applicationData = getDefaultData();
  saveData(state.applicationData);
  buildSchedule();
}
try {
  setStyleMode();
} catch {
  // Best-effort: a failure here (e.g. the DOM not being ready yet) shouldn't block boot.
}
setInterval(mainClockTick, 1000);
syncTestPlayPauseUi();
syncTestToolbar();
try {
  window.update();
} catch (error) {
  console.error('Orbit AI: the initial dashboard render failed.', error);
}
try {
  renderSyncPanel();
  startSyncLoop();
} catch (error) {
  console.error('Orbit AI: cross-device sync failed to initialize.', error);
}

// Caches the whole app shell so a return visit can load almost entirely
// from disk instead of the network - see public/sw.js for the actual
// caching strategy and why it can't go stale. import.meta.env.PROD (not a
// dev-mode check of our own) keeps this out of `vite dev`, where a service
// worker would just fight the dev server's own module reloading.
// updateViaCache:'none' stops the browser's own HTTP cache from ever
// serving a stale copy of sw.js itself when checking for an update.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

// iOS Safari (standalone/home-screen mode especially) can carry a stale
// 100dvh/env(safe-area-inset-top) snapshot across a JS-driven reload
// (forceAppRefresh()'s location.replace() in testsim-runtime.js reproduces
// this every time) or across a tab restored from the background/app
// switcher (bfcache) - the page is then laid out against whatever viewport
// metrics WebKit had cached instead of the real ones. Two nudges, since
// each targets a different cached value: re-touching the viewport meta tag
// (removing and re-inserting it, not just rewriting its content - a
// content rewrite alone is a documented no-op here) is what's specifically
// known to force Safari to redo its safe-area-inset-* computation; the
// body height toggle forces a genuine layout pass so a stuck 100dvh/100lvh
// (see the standalone media query in styles.css) picks the current
// viewport back up too.
function nudgeSafeAreaRecalc() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && viewport.parentNode) {
    const refreshed = viewport.cloneNode(true);
    viewport.replaceWith(refreshed);
  }
  document.body.style.height = '100.01dvh';
  requestAnimationFrame(() => {
    document.body.style.height = '';
  });
}
window.addEventListener('pageshow', nudgeSafeAreaRecalc);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') nudgeSafeAreaRecalc();
});
