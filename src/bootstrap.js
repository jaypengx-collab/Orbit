// ---- src/bootstrap.js ----
// Boot sequence: load settings, build the schedule, start the per-second
// clock. Runs once every other module has finished defining its functions -
// see main.js for why import order matters here.
import { setStyleMode } from './appearance.js';
import { syncTestToolbar } from './dashboard.js';
import { mainClockTick, syncTestPlayPauseUi } from './dashboard-render.js';
import { loadData } from './data.js';
import { buildSchedule } from './schedule.js';
import { state } from './state.js';

// ---- js/bootstrap.js ----
// Runs once every module below has finished defining its functions: loads saved
// settings, builds the runtime schedule from them, applies the saved theme, and
// starts the live clock that drives the dashboard.
// (state.applicationData is set here, not in state.js's own initial value -
// see the comment on state.js for why.)
state.applicationData = loadData();
buildSchedule();
try {
  setStyleMode();
} catch {
  // Best-effort: a failure here (e.g. the DOM not being ready yet) shouldn't block boot.
}
setInterval(mainClockTick, 1000);
syncTestPlayPauseUi();
syncTestToolbar();
window.update();

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
// 100dvh/env(safe-area-inset-bottom) snapshot across a JS-driven reload
// (forceAppRefresh()'s location.replace() in testsim-runtime.js reproduces
// this every time) or across a tab restored from the background/app
// switcher (bfcache) - the bottom safe-area padding is then computed from
// whatever viewport metrics WebKit had cached instead of the real ones,
// which is what makes it look "on" some loads and "off" others. Nudging
// the body's height by an imperceptible amount forces a genuine layout
// pass that picks the current values back up.
function nudgeSafeAreaRecalc() {
  document.body.style.height = '100.01dvh';
  requestAnimationFrame(() => {
    document.body.style.height = '';
  });
}
window.addEventListener('pageshow', nudgeSafeAreaRecalc);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') nudgeSafeAreaRecalc();
});
