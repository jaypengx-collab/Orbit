// ---- src/editor-schedule.js ----
// The weekly schedule grid and bell-time editor forms.
import { state } from './state.js';
import { validateTimeIntervals } from './data.js';
import {
  collectEditorFormState,
  dayDiffLabel,
  describeSettingsDiff,
  formatClassRef,
  normalizeSettingsData
} from './editor-backup.js';
import {
  editorTimeToMinutes,
  esc,
  getEditorBellPeriodCount,
  getEditorTeacherEntriesFromDom,
  hideEditorDiscardConfirm,
  openEditorFold,
  setEditorConfirmContent,
  showEditorConfirmSheet,
  showEditorSaveConfirm,
  sortEditorPeriodsByTime
} from './editor-core.js';
import { pad2 } from './schedule.js';

// ---- js/editor-schedule.js ----
// Renders the day-by-day period dropdowns in the editor.
// Renders day-by-day period selectors from the saved or currently edited schedule.
function renderEditorSchedule(weeklyScheduleOverride) {
  const container = document.getElementById('schedule-grid');
  const dayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const entries = getEditorTeacherEntriesFromDom();
  const periodCount = getEditorBellPeriodCount();
  const weeklySchedule = weeklyScheduleOverride || state.applicationData.weeklySchedule;

  container.innerHTML = '';

  [1, 2, 3, 4, 5, 6, 0].forEach(day => {
    const row = document.createElement('div');
    const daySchedule = weeklySchedule[day] || [];
    let periodHtml = '';

    row.className = 'schedule-day-row';
    row.dataset.day = String(day);

    for (let i = 0; i < periodCount; i++) {
      const value = daySchedule[i] || '';
      const options = entries
        .map(
          item =>
            `<option value="${esc(item.key)}" title="${esc(item.label)}"${value === item.key ? ' selected' : ''}>${esc(item.label)}</option>`
        )
        .join('');

      periodHtml += `<select class="period-select" data-period="${i}"><option value="">-</option>${options}</select>`;
    }

    row.innerHTML = `<div class="schedule-day-label">${dayLabels[day]}</div><div class="schedule-periods">${periodHtml}</div>`;
    container.appendChild(row);
  });
}

// Renders editable bell-time rows.
function renderEditorBells() {
  const container = document.getElementById('bell-list');
  container.innerHTML = '';

  state.applicationData.bellTimes.forEach((bellTime, index) => {
    container.appendChild(makeBellRow(index + 1, bellTime[0], bellTime[1]));
  });

  refreshBellNumbers();
}

// Creates one editable class-period time row.
function makeBellRow(number, startValue, endValue) {
  const row = document.createElement('div');
  row.className = 'bell-row';
  row.innerHTML = `<div class="bell-num">${number}</div><div class="bell-inputs"><input class="time-input bell-start" type="time" value="${esc(startValue)}"><span class="time-sep">→</span><input class="time-input bell-end" type="time" value="${esc(endValue)}"></div><button type="button" class="delete-btn" onclick="deleteBellRow(this)" aria-label="刪除節次">×</button>`;
  return row;
}

// Renumbers bell rows after adding or deleting periods.
function refreshBellNumbers() {
  document.querySelectorAll('#bell-list .bell-row').forEach((row, index) => {
    row.querySelector('.bell-num').textContent = index + 1;
  });
}

// Adds a new bell-time row using the previous row as a starting point.
function addBellRow() {
  const rows = document.querySelectorAll('#bell-list .bell-row');
  const last = rows[rows.length - 1];
  let startValue = '17:00';
  let endValue = '17:50';

  if (last && last.querySelector('.bell-end')) {
    startValue = last.querySelector('.bell-end').value;
    const [hours, minutes] = startValue.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + 50;
    endValue = `${pad2(Math.floor(endMinutes / 60))}:${pad2(endMinutes % 60)}`;
  }

  document
    .getElementById('bell-list')
    .appendChild(makeBellRow(rows.length + 1, startValue, endValue));
  refreshBellNumbers();
  const draft = collectEditorFormState();
  renderEditorSchedule(draft.weeklySchedule);
  sortEditorPeriodsByTime();
}

function getBellDeleteImpacts(index) {
  const data = collectEditorFormState();
  const impacts = [];
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow => {
    const day = parseInt(dayRow.dataset.day, 10);
    const select = dayRow.querySelectorAll('.period-select')[index];
    if (select && select.value)
      impacts.push(`${dayDiffLabel(day)}第 ${index + 1} 節：${formatClassRef(select.value, data)}`);
  });
  return impacts;
}
function applyBellRowDelete(btn) {
  const row = btn.closest('.bell-row');
  const index = Array.from(document.querySelectorAll('#bell-list .bell-row')).indexOf(row);
  if (index < 0) return;
  row.remove();
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow => {
    const select = dayRow.querySelectorAll('.period-select')[index];
    if (select) select.remove();
  });
  refreshBellNumbers();
  const draft = collectEditorFormState();
  renderEditorSchedule(draft.weeklySchedule);
  sortEditorPeriodsByTime();
}
function confirmBellRowDelete() {
  if (!state.pendingBellDelete) {
    hideEditorDiscardConfirm();
    return;
  }
  const btn = state.pendingBellDelete.btn;
  state.pendingBellDelete = null;
  hideEditorDiscardConfirm();
  applyBellRowDelete(btn);
}

// Deletes a bell-time row and rebuilds dependent schedule controls.
function deleteBellRow(btn) {
  const row = btn.closest('.bell-row');
  const index = Array.from(document.querySelectorAll('#bell-list .bell-row')).indexOf(row);
  const impacts = getBellDeleteImpacts(index);
  if (impacts.length) {
    state.pendingBellDelete = { btn, index };
    setEditorConfirmContent(
      `刪除第 ${index + 1} 節？`,
      `這會移除第 ${index + 1} 節的課程，後面的節次會往前移。`,
      impacts.join('\n'),
      '刪除',
      confirmBellRowDelete,
      '返回'
    );
    showEditorConfirmSheet();
    return;
  }
  applyBellRowDelete(btn);
}

// Renders named break blocks such as cleaning time.
function renderEditorBreaks() {
  const container = document.getElementById('break-list');
  container.innerHTML = '';

  (state.applicationData.breakTimes || []).forEach(item => {
    container.appendChild(makeBreakRow(item.name, item.start, item.end));
  });
  sortEditorBreaksByTime();
}

// Creates one editable named break row.
function makeBreakRow(name, start, end) {
  const row = document.createElement('div');
  row.className = 'bell-row break-row';
  row.innerHTML = `<div class="teacher-fields"><input class="editor-input break-name" placeholder="名稱" value="${esc(name || '')}"><div class="bell-inputs"><input class="time-input break-start" type="time" value="${esc(start || '08:50')}"><span class="time-sep">→</span><input class="time-input break-end" type="time" value="${esc(end || '09:10')}"></div></div><button class="delete-btn" onclick="deleteBreakRow(this)" aria-label="刪除特殊時段">×</button>`;
  return row;
}

// Adds a blank named break row.
function addBreakRow() {
  document.getElementById('break-list').appendChild(makeBreakRow('', '', ''));
  sortEditorBreaksByTime();
}

function sortEditorBreaksByTime() {
  const list = document.getElementById('break-list');
  if (!list) return;
  Array.from(list.querySelectorAll('.break-row'))
    .sort(
      (a, b) =>
        editorTimeToMinutes(a.querySelector('.break-start')?.value) -
        editorTimeToMinutes(b.querySelector('.break-start')?.value)
    )
    .forEach(row => list.appendChild(row));
}

// Deletes a named break row.
function deleteBreakRow(btn) {
  btn.closest('.break-row').remove();
}

// Saves editor changes, rebuilds the schedule, and closes the editor.
function saveEditor() {
  sortEditorPeriodsByTime();
  sortEditorBreaksByTime();
  const draft = collectEditorFormState();
  try {
    validateTimeIntervals(draft.bellTimes, draft.breakTimes);
  } catch (error) {
    showEditorTimeConflict(error.message);
    return;
  }
  const next = normalizeSettingsData(collectEditorFormState());
  const baseline = state.editorBaselineData || normalizeSettingsData(state.applicationData);
  const diff = describeSettingsDiff(baseline, next);
  state.pendingEditorSaveData = next;
  showEditorSaveConfirm(diff);
}

function showEditorTimeConflict(message) {
  setEditorConfirmContent(
    '時間有重疊',
    '目前設定無法儲存。請調整其中一個時間，讓課堂與特殊時段不要互相覆蓋。',
    message,
    '前往調整時間',
    () => {
      hideEditorDiscardConfirm();
      const isBreakConflict = /特殊時段/.test(message);
      openEditorFold(isBreakConflict ? 'editor-fold-breaks' : 'editor-fold-bells', true);
    },
    '返回編輯'
  );
  showEditorConfirmSheet();
}

// Exposed on window for inline HTML event handlers (onclick="..." in
// index.html and in generated template strings).
window.addBellRow = addBellRow;
window.addBreakRow = addBreakRow;
window.deleteBellRow = deleteBellRow;
window.deleteBreakRow = deleteBreakRow;
window.saveEditor = saveEditor;

export {
  refreshBellNumbers,
  renderEditorBells,
  renderEditorBreaks,
  renderEditorSchedule,
  saveEditor
};
