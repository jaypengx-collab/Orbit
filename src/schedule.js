// ---- src/schedule.js ----
import { state } from './state.js';

// ---- js/schedule.js ----
// Builds the runtime schedule rows from teacher, location, and bell-time data.
function buildSchedule() {
  state.runtimeSchedule = {};
  [0, 1, 2, 3, 4, 5, 6].forEach(day => {
    state.runtimeSchedule[day] = (state.applicationData.weeklySchedule[day] || [])
      .map((key, i) => {
        if (!key) return null;
        const m = state.applicationData.teacherDB[key] || ['未知', '未知'];
        const bt = state.applicationData.bellTimes[i];
        if (!bt) return null;
        return {
          key,
          n: m[0],
          t: m[1],
          s: bt[0],
          e: bt[1],
          isSplit: m[0].includes('/'),
          loc: state.applicationData.locationDB[key] || ''
        };
      })
      .filter(Boolean);
  });
  renderNavBar();
}
// Renders weekday navigation buttons based on which days have classes.
function renderNavBar() {
  const navBar = document.querySelector('.nav-bar');
  if (!navBar) return;
  const days = [1, 2, 3, 4, 5];
  const hasWE =
    (state.runtimeSchedule[0] && state.runtimeSchedule[0].length > 0) ||
    (state.runtimeSchedule[6] && state.runtimeSchedule[6].length > 0);
  if (hasWE) {
    if (state.runtimeSchedule[6] && state.runtimeSchedule[6].length > 0) days.push(6);
    if (state.runtimeSchedule[0] && state.runtimeSchedule[0].length > 0) days.push(0);
  }
  const labels = {
    0: '週日',
    1: '週一',
    2: '週二',
    3: '週三',
    4: '週四',
    5: '週五',
    6: '週六'
  };
  navBar.innerHTML = days
    .map(
      d =>
        `<button class="nav-item" data-day="${d}" onclick="handleNav(${d})" tabindex="0">${labels[d]}</button>`
    )
    .join('');
}
// Converts an HH:MM time string into minutes after midnight.
function parseTime(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
// Pads a number to two digits for clock display.
function pad2(n) {
  return String(n).padStart(2, '0');
}
// Calculates the ISO week number used for odd/even week logic.
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - ys) / 86400000 + 1) / 7);
}
// Returns the current odd/even week label, respecting the reverse-week setting.
function getWeekType() {
  const now = new Date();
  const wn = getISOWeekNumber(now);
  const even = wn % 2 === 0;
  return state.applicationData.reverseWeek ? (even ? '單' : '雙') : even ? '雙' : '單';
}
// Creates the small odd/even week badge used in the schedule UI.
function getWeekLabelHtml(w) {
  return `<span class="week-label ${w === '單' ? 'label-odd' : 'label-even'}">${w}週</span>`;
}
// Returns the next weekday tab after the given day.
function getNextSchoolDay(day) {
  for (let step = 1; step <= 7; step++) {
    const next = (day + step) % 7;
    if ((state.runtimeSchedule[next] || []).length > 0) return next;
  }
  if (day >= 1 && day <= 4) return day + 1;
  return 1;
}
// Chooses the correct subject and teacher for split odd/even-week classes.
function processSplitName(c, week) {
  if (!c.isSplit)
    return {
      n: c.n,
      t: c.t,
      label: ''
    };
  const nP = c.n.split('/'),
    tP = c.t.split('/');
  return {
    n: week === '單' ? nP[0].trim() : nP[1].trim(),
    t: week === '單' ? tP[0].trim() : (tP[1] || tP[0]).trim(),
    label: getWeekLabelHtml(week)
  };
}

export {
  buildSchedule,
  getISOWeekNumber,
  getNextSchoolDay,
  getWeekLabelHtml,
  getWeekType,
  pad2,
  parseTime,
  processSplitName
};
