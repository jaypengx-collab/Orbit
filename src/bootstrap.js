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
  setStyleMode('pro');
} catch (e) {}
setInterval(mainClockTick, 1000);
syncTestPlayPauseUi();
syncTestToolbar();
window.update();
