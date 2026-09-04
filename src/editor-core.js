// ---- src/editor-core.js ----
import { state } from './state.js';
import { openStylePanel } from './appearance.js';
import { closeTestPanel, getCountdownEvents } from './dashboard.js';
import {
  applyPendingSaveEditor,
  decodeTransferData,
  describeSettingsDiff,
  editorFormSnapshotString,
  isEditorDirty,
  normalizeSettingsData,
  resetOCRImporterUI,
  setTransferStatus,
  settingsDataForExport
} from './editor-backup.js';
import {
  refreshBellNumbers,
  renderEditorBells,
  renderEditorBreaks,
  renderEditorSchedule
} from './editor-schedule.js';
import {
  closeAssignSheet,
  moveEditorRowToPosition,
  renderEditorTeachers
} from './editor-teachers.js';

// ---- js/editor-core.js ----
// Builds a short display label for a class from its subject/teacher text.
// Teacher is appended in parentheses whenever the subject alone would be
// ambiguous (shared by another class) or when the subject is blank.
function formatClassLabel(subject, teacher, needsTeacher) {
  const cleanSubject = (subject || '').trim();
  const cleanTeacher = (teacher || '').trim();
  if (!cleanSubject) return cleanTeacher || '未命名';
  if (needsTeacher && cleanTeacher) return `${cleanSubject}（${cleanTeacher}）`;
  return cleanSubject;
}
// Collects available classes (key + display label) from the editor form's
// live subject/teacher inputs, so labels stay accurate mid-edit.
function getEditorTeacherEntriesFromDom() {
  const cards = [...document.querySelectorAll('#teacher-list .teacher-card')];
  const rows = cards
    .map(card => ({
      key: (card.dataset.origKey || '').trim(),
      subject: (card.querySelector('.tc-subject')?.value || '').trim(),
      teacher: (card.querySelector('.tc-teacher')?.value || '').trim()
    }))
    .filter(row => row.key);
  const subjectCounts = {};
  rows.forEach(row => {
    subjectCounts[row.subject] = (subjectCounts[row.subject] || 0) + 1;
  });
  const seen = new Set();
  const entries = [];
  rows.forEach(row => {
    if (seen.has(row.key)) return;
    seen.add(row.key);
    entries.push({
      key: row.key,
      label: formatClassLabel(row.subject, row.teacher, subjectCounts[row.subject] > 1)
    });
  });
  return entries;
}
// Looks up a single class's display label by key from the editor form's live inputs.
function getEditorClassLabelFromDom(key) {
  const entry = getEditorTeacherEntriesFromDom().find(item => item.key === key);
  return entry ? entry.label : '';
}
// Returns how many bell periods the editor should render.
function getEditorBellPeriodCount() {
  const n = document.querySelectorAll('#bell-list .bell-row').length;
  return n > 0 ? n : (state.applicationData.bellTimes || []).length;
}
// Converts an HH:MM value into minutes for editor sorting.
function editorTimeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return 9999;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
// Sorts bell rows by start time and moves the matching schedule dropdowns with them.
function sortEditorPeriodsByTime() {
  const bellList = document.getElementById('bell-list');
  const rows = Array.from(bellList.querySelectorAll('.bell-row'));
  if (rows.length < 2) return;

  const ordered = rows
    .map((row, index) => ({
      row,
      index,
      start: editorTimeToMinutes(row.querySelector('.bell-start')?.value),
      end: editorTimeToMinutes(row.querySelector('.bell-end')?.value)
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);

  if (ordered.every((item, newIndex) => item.index === newIndex)) return;

  ordered.forEach(item => bellList.appendChild(item.row));

  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow => {
    const periods = dayRow.querySelector('.schedule-periods');
    const selects = Array.from(periods.querySelectorAll('.period-select'));
    ordered.forEach((item, newIndex) => {
      const select = selects[item.index];
      if (select) {
        select.dataset.period = String(newIndex);
        periods.appendChild(select);
      }
    });
  });

  refreshBellNumbers();
}
// Refreshes every class-period dropdown after teacher keys or names change.
function refreshPeriodSelectOptions() {
  const entries = getEditorTeacherEntriesFromDom();
  document.querySelectorAll('#schedule-grid .period-select').forEach(sel => {
    const cur = sel.value;
    const list =
      entries.some(item => item.key === cur) || !cur
        ? entries
        : entries.concat({ key: cur, label: cur });
    const opts =
      `<option value="">-</option>` +
      list
        .map(
          item =>
            `<option value="${esc(item.key)}" title="${esc(item.label)}">${esc(item.label)}</option>`
        )
        .join('');
    sel.innerHTML = opts;
    sel.value = cur;
  });
}
// Escapes text before inserting it into generated HTML.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Opens the schedule editor and prepares its editable fields.
// Editor navigation and confirmation sheets manage unsaved changes safely.
function openEditor() {
  closeAssignSheet();
  hideEditorDiscardConfirm();
  closeTestPanel();
  document.querySelector('.top-actions')?.classList.remove('open');
  const sheet = document.getElementById('editor-sheet');

  document.body.classList.add('editor-open');
  sheet.classList.add('show');

  try {
    renderEditorTeachers();
    renderEditorBells();
    renderEditorBreaks();
    renderEditorSchedule();
    renderCountdownEvent();
    sortEditorPeriodsByTime();
    syncEditorToggles();
    orderEditorFolds();
    moveEditorControlsIntoLayers();
    ensureEditorBackButtons();
    openEditorFold('editor-fold-schedule');
    state.editorBaselineSnapshot = editorFormSnapshotString();
    state.editorBaselineData = settingsDataForExport();
    setTransferStatus('');
  } catch (error) {
    console.error(error);
  }
}

function orderEditorFolds() {
  const inner = document.querySelector('#editor-sheet .editor-inner');
  const saveBtn = inner && inner.querySelector('.save-btn');
  if (!inner || !saveBtn) return;
  [
    'editor-fold-schedule',
    'editor-fold-countdown',
    'editor-fold-teachers',
    'editor-fold-bells',
    'editor-fold-breaks',
    'editor-fold-transfer'
  ].forEach(id => {
    const section = document.getElementById(id);
    if (section) inner.insertBefore(section, saveBtn);
  });
}
function renderCountdownEvent() {
  const list = document.getElementById('countdown-event-list');
  if (!list) return;
  list.innerHTML = '';
  getCountdownEvents().forEach((event, index) => addCountdownEventRow(event, index));
  refreshCountdownMoveButtons();
}
function addCountdownEventRow(event = { name: '', startDate: '', endDate: '' }, index) {
  const list = document.getElementById('countdown-event-list');
  if (!list || list.children.length >= 12) return;
  const row = document.createElement('div');
  row.className = 'countdown-event-row';
  row.innerHTML =
    '<div class="countdown-event-header"><span class="countdown-event-title">倒數活動</span><div class="countdown-event-actions"><span class="countdown-drag-handle" role="button" tabindex="0" title="拖曳排序" aria-label="拖曳排序">☰</span><label class="order-position-label">順序<input class="order-position" type="number" min="1" inputmode="numeric" aria-label="倒數活動順序"></label><button type="button" class="countdown-event-remove" aria-label="移除倒數">×</button></div></div><div class="countdown-event-fields"><label>活動名稱<input class="editor-input countdown-event-name" maxlength="80" placeholder="例如：116 學測"></label><label class="countdown-event-daterange-label">日期<div class="countdown-date-range"><input class="editor-input countdown-event-start" type="date" aria-label="開始日期"><span class="time-sep">→</span><input class="editor-input countdown-event-end" type="date" aria-label="結束日期"></div></label></div>';
  const nameInput = row.querySelector('.countdown-event-name');
  const titleLabel = row.querySelector('.countdown-event-title');
  nameInput.value = event.name;
  if (event.name) titleLabel.textContent = event.name;
  nameInput.addEventListener('input', () => {
    titleLabel.textContent = nameInput.value.trim() || '倒數活動';
  });
  const startInput = row.querySelector('.countdown-event-start');
  const endInput = row.querySelector('.countdown-event-end');
  startInput.value = event.startDate || event.date || '';
  endInput.value = event.endDate || event.date || '';
  startInput.addEventListener('change', () => {
    if (!endInput.value || endInput.value < startInput.value) endInput.value = startInput.value;
  });
  row.querySelector('.countdown-event-remove').addEventListener('click', () => {
    if (list.children.length > 1) row.remove();
    else row.querySelectorAll('input').forEach(input => (input.value = ''));
  });
  list.appendChild(row);
  row.querySelector('.order-position').value = String(list.children.length);
  const positionInput = row.querySelector('.order-position');
  positionInput.addEventListener('change', event =>
    moveEditorRowToPosition(row, event.target.value, '#countdown-event-list .countdown-event-row')
  );
  positionInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      moveEditorRowToPosition(
        row,
        event.target.value,
        '#countdown-event-list .countdown-event-row'
      );
      positionInput.blur();
    }
  });
  bindCountdownDrag(row);
  refreshCountdownMoveButtons();
}
function refreshCountdownMoveButtons() {
  const rows = [...document.querySelectorAll('#countdown-event-list .countdown-event-row')];
  rows.forEach((row, index) => {
    row.querySelector('.countdown-drag-handle')?.setAttribute('aria-label', '拖曳倒數活動排序');
    const input = row.querySelector('.order-position');
    if (input) {
      input.max = String(rows.length);
      input.value = String(index + 1);
    }
  });
}
function getEditorScrollContainer(handle) {
  const sheet = handle.closest('.editor-sheet');
  if (!sheet) return null;
  const activeFold = sheet.querySelector('details.editor-fold.active .editor-fold-body');
  const inner = sheet.querySelector('.editor-inner');
  const candidates = [activeFold, inner, sheet].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.scrollHeight > candidate.clientHeight) return candidate;
  }
  return sheet;
}
function autoScrollEditorWhileDragging(handle, clientY) {
  const scroller = getEditorScrollContainer(handle);
  if (!scroller) return;
  const bounds = scroller.getBoundingClientRect();
  const edge = 72;
  const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  if (clientY < bounds.top + edge) {
    scroller.scrollTop = Math.max(
      0,
      scroller.scrollTop - Math.ceil((bounds.top + edge - clientY) / 4)
    );
  } else if (clientY > bounds.bottom - edge) {
    scroller.scrollTop = Math.min(
      maxScroll,
      scroller.scrollTop + Math.ceil((clientY - (bounds.bottom - edge)) / 4)
    );
  }
}
// Shared vertical drag-to-reorder for editor list rows (teacher cards, countdown
// events): drags `row` by the handle matching `handleSelector`, reordering it among
// its siblings matching `siblingsSelector`, auto-scrolling the editor sheet near its
// edges, and calling `onMove` (if given) after every reorder and once dragging ends.
function bindEditorDragReorder(row, handleSelector, siblingsSelector, onMove) {
  const handle = row.querySelector(handleSelector);
  if (!handle || handle.dataset.bound) return;
  handle.dataset.bound = '1';
  handle.style.touchAction = 'none';
  let dragging = false;
  let lastY = 0;
  let scrollFrame = 0;
  const move = event => {
    if (!dragging) return;
    lastY = event.clientY;
    autoScrollEditorWhileDragging(handle, event.clientY);
    const siblings = [...document.querySelectorAll(siblingsSelector)].filter(item => item !== row);
    const target = siblings.find(
      item => event.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2
    );
    if (target) target.parentElement.insertBefore(row, target);
    else if (siblings.length) siblings[siblings.length - 1].parentElement.appendChild(row);
    onMove?.();
  };
  const autoScroll = () => {
    if (!dragging) return;
    const scroller = getEditorScrollContainer(handle);
    const before = scroller?.scrollTop || 0;
    autoScrollEditorWhileDragging(handle, lastY);
    if (scroller && scroller.scrollTop !== before) move({ clientY: lastY });
    scrollFrame = requestAnimationFrame(autoScroll);
  };
  const finish = event => {
    if (!dragging) return;
    dragging = false;
    row.classList.remove('is-dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);
    cancelAnimationFrame(scrollFrame);
    if (event?.pointerId !== undefined && handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    onMove?.();
  };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    lastY = event.clientY;
    row.classList.add('is-dragging');
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    scrollFrame = requestAnimationFrame(autoScroll);
  });
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}
function bindCountdownDrag(row) {
  bindEditorDragReorder(
    row,
    '.countdown-drag-handle',
    '#countdown-event-list .countdown-event-row'
  );
}
function moveEditorControlsIntoLayers() {
  const inner = document.querySelector('#editor-sheet .editor-inner');
  const scheduleBody = document.querySelector('#editor-fold-schedule .editor-fold-body');
  const transfer = document.getElementById('editor-fold-transfer');
  const options = document.getElementById('editor-fold-options');
  const toggleRow = options && options.querySelector('.toggle-row');
  const drillActions = scheduleBody && scheduleBody.querySelector('.editor-drill-actions');
  if (inner) inner.classList.add('is-layered');
  if (transfer) {
    transfer.classList.add('editor-save-tools');
    transfer.open = false;
  }
  if (toggleRow && scheduleBody && !scheduleBody.querySelector('.editor-inline-options')) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-inline-options';
    wrap.appendChild(toggleRow);
    if (drillActions) scheduleBody.insertBefore(wrap, drillActions);
    else scheduleBody.prepend(wrap);
  }
  if (options) options.style.display = 'none';
}
function ensureEditorBackButtons() {
  document.querySelectorAll('#editor-sheet details.editor-fold').forEach(section => {
    if (
      section.id === 'editor-fold-schedule' ||
      section.id === 'editor-fold-transfer' ||
      section.id === 'editor-fold-options'
    )
      return;
    if (section.closest('#ocr-import-result')) return;
    const body = section.querySelector('.editor-fold-body');
    if (!body || body.querySelector('.editor-back-row')) return;
    const row = document.createElement('div');
    row.className = 'editor-back-row';
    row.innerHTML =
      '<button type="button" class="editor-back-btn" onclick="openEditorFold(\'editor-fold-schedule\')">返回課表</button>';
    body.prepend(row);
  });
}
function clearTransferField() {
  const text = document.getElementById('settings-transfer-text');
  if (text) {
    text.value = '';
    text.blur();
  }
  setTransferStatus('');
}
function openEditorFold(id, force = false) {
  document.querySelectorAll('#editor-sheet details.editor-fold').forEach(section => {
    // The transfer/OCR-import section is an always-visible tools panel, not a layer —
    // it manages its own open/closed state (see initEditorAccordion) and must never be
    // force-closed just because a different page layer became active, or an expanded
    // import button the user is mid-way through using would vanish under them.
    if (section.id === 'editor-fold-transfer') return;
    const active = section.id === id;
    section.open = active;
    section.classList.toggle('active', active);
  });
  // Do not force-scroll the editor when switching layers.
}

function setEditorConfirmContent(
  title,
  message,
  diffText,
  confirmLabel,
  confirmHandler,
  cancelLabel = '取消',
  options = {}
) {
  const sheet = document.getElementById('editor-confirm-sheet');
  const titleEl = document.getElementById('editor-confirm-title');
  const msgEl = document.getElementById('editor-confirm-msg');
  const overlay = document.getElementById('editor-confirm-overlay');
  const buttons = sheet.querySelectorAll('.editor-confirm-btn');
  const cancelBtn = buttons[0];
  const confirmBtn = buttons[1];
  let extraBtn = document.getElementById('editor-confirm-extra-btn');
  if (!extraBtn) {
    extraBtn = document.createElement('button');
    extraBtn.id = 'editor-confirm-extra-btn';
    extraBtn.type = 'button';
    extraBtn.className = 'editor-confirm-btn';
    sheet.querySelector('.editor-confirm-actions').appendChild(extraBtn);
  }
  const canCancel = cancelLabel !== null && !options.required;
  let diffEl = document.getElementById('editor-import-diff');
  if (!diffEl) {
    diffEl = document.createElement('div');
    diffEl.id = 'editor-import-diff';
    diffEl.className = 'editor-import-diff';
    msgEl.insertAdjacentElement('afterend', diffEl);
  }
  titleEl.textContent = title;
  msgEl.textContent = message;
  diffEl.textContent = diffText || '';
  diffEl.scrollTop = 0;
  diffEl.style.display = diffText ? 'block' : 'none';
  cancelBtn.style.display = canCancel ? '' : 'none';
  cancelBtn.textContent = canCancel ? cancelLabel : '';
  cancelBtn.onclick = canCancel ? options.cancelHandler || hideEditorDiscardConfirm : null;
  extraBtn.style.display = options.extraLabel ? '' : 'none';
  extraBtn.textContent = options.extraLabel || '';
  extraBtn.onclick = options.extraLabel ? options.extraHandler || hideEditorDiscardConfirm : null;
  overlay.onclick = canCancel
    ? hideEditorDiscardConfirm
    : function (event) {
        event.stopPropagation();
      };
  confirmBtn.textContent = confirmLabel;
  confirmBtn.onclick = confirmHandler;
}
function showEditorConfirmSheet() {
  document.getElementById('editor-confirm-overlay').classList.add('show');
  document.getElementById('editor-confirm-sheet').classList.add('show');
  document.getElementById('editor-confirm-overlay').setAttribute('aria-hidden', 'false');
}
function getEditorUnsavedDiff() {
  try {
    sortEditorPeriodsByTime();
    return describeSettingsDiff(
      state.editorBaselineData || normalizeSettingsData(state.applicationData),
      settingsDataForExport()
    );
  } catch (error) {
    return '';
  }
}
async function showEditorDiscardConfirm() {
  // Pasted-text or AI/OCR import data that was never actually applied isn't reflected
  // in the settings diff below — it needs its own explanation so the user understands
  // what they're about to lose.
  if (!isEditorDirty() && (await hasUnconsumedImportData())) {
    setEditorConfirmContent(
      '尚未匯入內容？',
      getUnconsumedImportWarningText(),
      '',
      '捨棄離開',
      discardEditorChangesAndClose,
      '返回'
    );
    showEditorConfirmSheet();
    return;
  }
  setEditorConfirmContent(
    '捨棄變更？',
    '以下尚未儲存的變更將不會套用。',
    getEditorUnsavedDiff(),
    '捨棄',
    discardEditorChangesAndClose,
    '返回'
  );
  showEditorConfirmSheet();
}
function showEditorSaveConfirm(diffText) {
  setEditorConfirmContent(
    '要儲存嗎？',
    '會套用以下變更。',
    diffText,
    '儲存',
    applyPendingSaveEditor,
    '返回'
  );
  showEditorConfirmSheet();
}
// Hides the discard confirmation sheet.
function hideEditorDiscardConfirm() {
  state.pendingAfterEditorDiscard = null;
  state.pendingEditorImportData = null;
  state.pendingEditorSaveData = null;
  state.pendingBellDelete = null;
  state.pendingTeacherDelete = null;
  state.pendingStyleSaveData = null;
  state.pendingStyleSlotIndex = null;
  state.pendingStyleSlotSaveIndex = null;
  const diffEl = document.getElementById('editor-import-diff');
  if (diffEl) diffEl.scrollTop = 0;
  document.getElementById('editor-confirm-overlay').classList.remove('show');
  document.getElementById('editor-confirm-sheet').classList.remove('show');
  document.getElementById('editor-confirm-overlay').setAttribute('aria-hidden', 'true');
}

// Discards editor changes and closes the editor.
function discardEditorChangesAndClose() {
  const pending = state.pendingAfterEditorDiscard;
  state.pendingAfterEditorDiscard = null;
  hideEditorDiscardConfirm();
  closeEditor(true);
  if (pending === 'test') {
    // testsim-runtime.js monkey-patches window.openTestPanel (via a
    // window[name] = ... loop, not a plain window.openTestPanel = ...
    // assignment) - go through window here so that patch still applies,
    // same reasoning as window.update() elsewhere.
    window.openTestPanel();
  } else if (pending === 'style') {
    openStylePanel();
  }
}

function getUnconsumedImportWarningText() {
  const text = document.getElementById('settings-transfer-text');
  const hasPastedText = !!(text && text.value.trim());
  const result = document.getElementById('ocr-import-result');
  const hasAiPreview = !!(result && !result.hidden && result.childElementCount > 0);

  if (hasPastedText && hasAiPreview) return '未匯入的貼上內容與 AI 辨識結果將被清除。';
  if (hasPastedText) return '未匯入的貼上內容將被清除。';
  if (hasAiPreview) return '未匯入的 AI 辨識結果將被清除。';
  return '未匯入內容將被清除。';
}

async function hasDuplicateTransferData() {
  const text = document.getElementById('settings-transfer-text');
  if (!text || !text.value.trim()) return false;
  try {
    const next = normalizeSettingsData(await decodeTransferData(text.value), {
      requireMarker: true
    });
    const current = settingsDataForExport();
    return describeSettingsDiff(current, next) === '沒有變更。';
  } catch (error) {
    return false;
  }
}

// True when there is pasted-JSON or AI-photo-recognized import data sitting around that was
// never actually applied — used so we can warn the user before it gets wiped on exit.
async function hasUnconsumedImportData() {
  const text = document.getElementById('settings-transfer-text');
  const hasPastedText = !!(text && text.value.trim());
  const result = document.getElementById('ocr-import-result');
  const hasAiPreview = !!(result && !result.hidden && result.childElementCount > 0);
  if (hasPastedText && (await hasDuplicateTransferData())) return false;
  return hasPastedText || hasAiPreview || !!state.pendingEditorImportData;
}

// Reminds the user that unapplied import data (pasted text or AI photo result) is being discarded.
function notifyDiscardedImportData() {
  const toast = document.getElementById('save-toast');
  if (!toast) return;
  const previousText = toast.textContent;
  toast.textContent = '已清除未匯入內容。';
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.textContent = previousText;
    }, 300);
  }, 2500);
}

// Closes the editor, asking for confirmation when there are unsaved changes.
async function closeEditor(force) {
  const sheet = document.getElementById('editor-sheet');

  if (typeof state.isOcrProcessing !== 'undefined' && state.isOcrProcessing) {
    setEditorConfirmContent(
      'AI 辨識中',
      'Gemini 正在辨識課表圖片，請稍候辨識完成後再關閉，否則辨識結果將會遺失。',
      '',
      '知道了',
      hideEditorDiscardConfirm,
      null
    );
    showEditorConfirmSheet();
    return;
  }

  if (!sheet.classList.contains('show')) {
    hideEditorDiscardConfirm();
    document.body.classList.remove('editor-open');
    return;
  }

  if (!force && (isEditorDirty() || (await hasUnconsumedImportData()))) {
    showEditorDiscardConfirm();
    return;
  }

  hideEditorDiscardConfirm();
  const hadUnconsumedImportData = await hasUnconsumedImportData();
  sheet.classList.remove('show');
  document.body.classList.remove('editor-open');
  // Wipe any AI import data (pasted JSON and AI-recognized photo result) so it never lingers
  // into the next time the editor is opened.
  clearTransferField();
  resetOCRImporterUI();
  state.pendingEditorImportData = null;
  closeTestPanel();
  if (hadUnconsumedImportData) notifyDiscardedImportData();
}

// Updates editor toggle controls from the saved app data.
function syncEditorToggles() {
  const btn = document.getElementById('toggle-reverse');
  btn.classList.toggle('on', !!state.applicationData.reverseWeek);
}

// Toggles whether odd/even week logic is reversed.
function toggleReverse() {
  const btn = document.getElementById('toggle-reverse');
  btn.classList.toggle('on');
}

// Exposed on window for inline HTML event handlers (onclick="..." in
// index.html and in generated template strings).
window.addCountdownEventRow = addCountdownEventRow;
window.closeEditor = closeEditor;
window.discardEditorChangesAndClose = discardEditorChangesAndClose;
window.hideEditorDiscardConfirm = hideEditorDiscardConfirm;
window.openEditor = openEditor;
window.openEditorFold = openEditorFold;
window.toggleReverse = toggleReverse;

export {
  bindEditorDragReorder,
  closeEditor,
  discardEditorChangesAndClose,
  editorTimeToMinutes,
  esc,
  formatClassLabel,
  getEditorBellPeriodCount,
  getEditorClassLabelFromDom,
  getEditorTeacherEntriesFromDom,
  hasUnconsumedImportData,
  hideEditorDiscardConfirm,
  openEditorFold,
  refreshCountdownMoveButtons,
  refreshPeriodSelectOptions,
  renderCountdownEvent,
  setEditorConfirmContent,
  showEditorConfirmSheet,
  showEditorDiscardConfirm,
  showEditorSaveConfirm,
  sortEditorPeriodsByTime,
  syncEditorToggles
};
