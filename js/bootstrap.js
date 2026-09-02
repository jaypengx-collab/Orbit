// Runs once every module below has finished defining its functions: loads saved
// settings, builds the runtime schedule from them, applies the saved theme, and
// starts the live clock that drives the dashboard.
let applicationData = loadData();
buildSchedule();
try {
  setStyleMode('pro');
} catch (e) {
}
setInterval(mainClockTick, 1000);
syncTestPlayPauseUi();
syncTestToolbar();
update();
