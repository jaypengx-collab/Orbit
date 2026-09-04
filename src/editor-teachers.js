// ---- src/editor-teachers.js ----
// The teacher/subject list editor and the day-by-day period assignment UI.
import { state } from './state.js';
import { collectEditorFormState, dayDiffLabel, formatClassRef } from './editor-backup.js';
import {
  bindEditorDragReorder,
  esc,
  getEditorBellPeriodCount,
  getEditorClassLabelFromDom,
  hideEditorDiscardConfirm,
  refreshCountdownMoveButtons,
  refreshPeriodSelectOptions,
  setEditorConfirmContent,
  showEditorConfirmSheet
} from './editor-core.js';

// ---- js/editor-teachers.js ----
// Renders the editable teacher list.
function renderEditorTeachers() {
  const container = document.getElementById('teacher-list');
  container.innerHTML = '';

  (state.applicationData.teacherOrder || Object.keys(state.applicationData.teacherDB))
    .filter(key => state.applicationData.teacherDB[key])
    .forEach(key => {
      const val = state.applicationData.teacherDB[key];
      const loc = state.applicationData.locationDB[key] || '';
      container.appendChild(makeTeacherCard(key, val[0], val[1], loc));
    });
  refreshTeacherMoveButtons();
}

// Generates a stable internal id for a class. Never shown or edited by the
// user - it only ever lives in dataset.origKey and the saved data's map keys.
function generateTeacherKey() {
  const existing = new Set(
    [...document.querySelectorAll('#teacher-list .teacher-card')].map(card => card.dataset.origKey)
  );
  let key;
  do {
    key = 'c' + Math.random().toString(36).slice(2, 8);
  } while (existing.has(key));
  return key;
}

// Creates one editable teacher row.
function makeTeacherCard(key, subject, teacher, location) {
  const div = document.createElement('div');
  div.className = 'teacher-card';
  div.dataset.origKey = key;
  div.innerHTML = `<div class="teacher-avatar"></div><div class="teacher-fields"><input class="editor-input tc-subject" placeholder="科目" value="${esc(subject)}"><input class="editor-input tc-teacher" placeholder="教師" value="${esc(teacher)}"><input class="editor-input tc-location" placeholder="教室(選填)" value="${esc(location || '')}"></div><div class="teacher-order-actions"><span class="teacher-drag-handle" role="button" tabindex="0" title="拖曳排序" aria-label="拖曳排序">☰</span><label class="order-position-label">順序<input class="order-position" type="number" min="1" inputmode="numeric" aria-label="科目教師順序"></label><button type="button" class="teacher-assign" onclick="assignTeacherFromMenu(this)" aria-label="指定課節">排課</button><button type="button" class="delete-btn" onclick="deleteTeacherCard(this)" aria-label="刪除">×</button></div>`;
  updateTeacherCardAvatar(div);
  const positionInput = div.querySelector('.order-position');
  positionInput.addEventListener('change', event =>
    moveEditorRowToPosition(div, event.target.value, '#teacher-list .teacher-card')
  );
  positionInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      moveEditorRowToPosition(div, event.target.value, '#teacher-list .teacher-card');
      positionInput.blur();
    }
  });
  bindEditorDragReorder(div, '.teacher-drag-handle', '#teacher-list .teacher-card', () => {
    refreshTeacherMoveButtons();
    refreshPeriodSelectOptions();
  });

  div.querySelector('.tc-subject').addEventListener('input', function () {
    updateTeacherCardAvatar(div);
    refreshPeriodSelectOptions();
  });
  div.querySelector('.tc-teacher').addEventListener('input', refreshPeriodSelectOptions);

  return div;
}

// Deterministic background color for a subject's avatar, so the same subject
// always gets the same color across renders.
const TEACHER_AVATAR_HUES = [6, 28, 48, 145, 168, 200, 225, 265, 290, 330];
function subjectAvatarHue(subject) {
  const text = String(subject || '').trim();
  if (!text) return TEACHER_AVATAR_HUES[0];
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return TEACHER_AVATAR_HUES[hash % TEACHER_AVATAR_HUES.length];
}
// Updates a teacher card's colored initial avatar from its current subject text.
function updateTeacherCardAvatar(card) {
  const avatar = card.querySelector('.teacher-avatar');
  if (!avatar) return;
  const subject = (card.querySelector('.tc-subject')?.value || '').trim();
  const initial = subject ? [...subject][0] : '?';
  const hue = subjectAvatarHue(subject);
  avatar.textContent = initial;
  avatar.style.setProperty('--avatar-hue', String(hue));
}
let pendingAssignment = null;
let assignmentDraft = null;
function closeAssignSheet() {
  document.getElementById('assign-overlay')?.classList.remove('show');
  document.getElementById('assign-sheet')?.classList.remove('show');
  document.getElementById('assign-overlay')?.setAttribute('aria-hidden', 'true');
  pendingAssignment = null;
  assignmentDraft = null;
}
function openAssignSheet(key) {
  const grid = document.getElementById('assign-grid'),
    subtitle = document.getElementById('assign-subtitle'),
    tabs = document.getElementById('assign-day-tabs');
  if (!grid) return;
  subtitle.textContent = `選擇「${getEditorClassLabelFromDom(key) || key}」要放置的星期與節次`;
  grid.replaceChildren();
  assignmentDraft = { key, original: new Map(), draft: new Map() };
  const labels = { 1: '週一', 2: '週二', 3: '週三', 4: '週四', 5: '週五', 6: '週六', 0: '週日' };
  const count = getEditorBellPeriodCount();
  [1, 2, 3, 4, 5, 6, 0].forEach(day => {
    for (let period = 0; period < count; period++) {
      const select = document
        .querySelector(`#schedule-grid .schedule-day-row[data-day="${day}"]`)
        ?.querySelectorAll('.period-select')[period];
      const slot = `${day}:${period}`,
        original = select?.value || '';
      assignmentDraft.original.set(slot, original);
      assignmentDraft.draft.set(slot, original);
    }
  });
  tabs.replaceChildren();
  [1, 2, 3, 4, 5, 6, 0].forEach(day => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'assign-day-tab';
    tab.dataset.day = day;
    tab.setAttribute('role', 'tab');
    tab.textContent = labels[day];
    tab.onclick = () => renderAssignmentDay(day);
    tabs.appendChild(tab);
  });
  state.assignmentDay = 1;
  renderAssignmentDay(state.assignmentDay);
  document.getElementById('assign-overlay').classList.add('show');
  document.getElementById('assign-sheet').classList.add('show');
  document.getElementById('assign-overlay').setAttribute('aria-hidden', 'false');
}
function renderAssignmentDay(day) {
  const grid = document.getElementById('assign-grid');
  if (!grid || !assignmentDraft) return;
  state.assignmentDay = day;
  document.querySelectorAll('#assign-day-tabs .assign-day-tab').forEach(tab => {
    const active = Number(tab.dataset.day) === day;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  grid.replaceChildren();
  const count = getEditorBellPeriodCount();
  const row = document.createElement('div');
  row.className = 'assign-day-row';
  const label = document.createElement('div');
  label.className = 'assign-day-label';
  label.textContent = {
    1: '週一',
    2: '週二',
    3: '週三',
    4: '週四',
    5: '週五',
    6: '週六',
    0: '週日'
  }[day];
  row.appendChild(label);
  const periods = document.createElement('div');
  periods.className = 'assign-periods';
  for (let period = 0; period < count; period++) {
    const slot = `${day}:${period}`,
      original = assignmentDraft.original.get(slot) || '',
      value = assignmentDraft.draft.get(slot) || '';
    const valueLabel = value ? getEditorClassLabelFromDom(value) || value : '';
    const box = document.createElement('button');
    box.type = 'button';
    box.dataset.slot = slot;
    box.className =
      'assign-box' +
      (value ? ' occupied' : '') +
      (value === assignmentDraft.key ? ' assigned' : '');
    box.textContent = `${period + 1} · ${valueLabel || '—'}`;
    box.title = value ? `第 ${period + 1} 節目前是：${valueLabel}` : `第 ${period + 1} 節（空白）`;
    box.onclick = () => assignToSlot(assignmentDraft.key, day, period);
    periods.appendChild(box);
  }
  row.appendChild(periods);
  grid.appendChild(row);
}
function assignToSlot(key, day, period) {
  if (!assignmentDraft) return;
  const slot = `${day}:${period}`,
    box = document.querySelector(`#assign-grid .assign-box[data-slot="${slot}"]`);
  const current = assignmentDraft.draft.get(slot) || '',
    original = assignmentDraft.original.get(slot) || '';
  if (current === key) assignmentDraft.draft.set(slot, original === key ? '' : original);
  else {
    if (current && current !== key) {
      pendingAssignment = { key, day, period };
      setEditorConfirmContent(
        '覆蓋這個時段？',
        `第 ${period + 1} 節目前是「${getEditorClassLabelFromDom(current) || current}」，確定改成「${getEditorClassLabelFromDom(key) || key}」嗎？`,
        '',
        '確定覆蓋',
        confirmAssignment,
        '返回'
      );
      showEditorConfirmSheet();
      return;
    }
    assignmentDraft.draft.set(slot, key);
  }
  if (box) {
    const value = assignmentDraft.draft.get(slot) || '';
    box.textContent = `${period + 1} · ${value ? getEditorClassLabelFromDom(value) || value : '—'}`;
    box.classList.toggle('assigned', value === key);
    box.classList.toggle('occupied', !!value);
  }
}
function confirmAssignment() {
  const pending = pendingAssignment;
  pendingAssignment = null;
  hideEditorDiscardConfirm();
  if (pending && assignmentDraft) {
    assignmentDraft.draft.set(`${pending.day}:${pending.period}`, pending.key);
    renderAssignmentDay(pending.day);
  }
}
function applyAssignments() {
  if (!assignmentDraft) return;
  assignmentDraft.draft.forEach((value, slot) => {
    const [day, period] = slot.split(':').map(Number);
    const select = document
      .querySelector(`#schedule-grid .schedule-day-row[data-day="${day}"]`)
      ?.querySelectorAll('.period-select')[period];
    if (select && select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  closeAssignSheet();
}
function assignTeacherFromMenu(button) {
  const card = button.closest('.teacher-card');
  const key = (card?.dataset.origKey || '').trim();
  if (!key) return;
  openAssignSheet(key);
}
function moveEditorRowToPosition(row, value, selector) {
  const rows = [...document.querySelectorAll(selector)].filter(item => item !== row);
  if (!rows.length) return;
  const position = Math.max(1, Math.min(rows.length + 1, Number.parseInt(value, 10) || 1));
  const target = rows[position - 1];
  if (target) target.parentElement.insertBefore(row, target);
  else rows[rows.length - 1].parentElement.appendChild(row);
  if (row.classList.contains('teacher-card')) {
    refreshTeacherMoveButtons();
    refreshPeriodSelectOptions();
  } else {
    refreshCountdownMoveButtons();
  }
}
function refreshTeacherMoveButtons() {
  const rows = Array.from(document.querySelectorAll('#teacher-list .teacher-card'));
  rows.forEach((row, index) => {
    const input = row.querySelector('.order-position');
    if (input) {
      input.max = String(rows.length);
      input.value = String(index + 1);
    }
  });
}

// Adds a blank teacher row to the editor.
function addTeacherRow() {
  document
    .getElementById('teacher-list')
    .appendChild(makeTeacherCard(generateTeacherKey(), '', ''));
  refreshPeriodSelectOptions();
}

function getTeacherDeleteKey(card) {
  return (card?.dataset.origKey || '').trim();
}
function getTeacherDeleteImpacts(key) {
  const data = collectEditorFormState();
  const impacts = [];
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow => {
    const day = parseInt(dayRow.dataset.day, 10);
    dayRow.querySelectorAll('.period-select').forEach((select, index) => {
      if (select.value === key)
        impacts.push(`${dayDiffLabel(day)}第 ${index + 1} 節：${formatClassRef(key, data)}`);
    });
  });
  return impacts;
}
function applyTeacherCardDelete(btn) {
  const card = btn.closest('.teacher-card');
  const key = (card?.dataset.origKey || '').trim();
  card?.remove();
  document.querySelectorAll('#schedule-grid .period-select').forEach(select => {
    if (select.value === key) select.value = '';
  });
  refreshPeriodSelectOptions();
}
function confirmTeacherCardDelete() {
  if (!state.pendingTeacherDelete) {
    hideEditorDiscardConfirm();
    return;
  }
  const btn = state.pendingTeacherDelete.btn;
  state.pendingTeacherDelete = null;
  hideEditorDiscardConfirm();
  applyTeacherCardDelete(btn);
}

// Removes a teacher row from the editor.
function deleteTeacherCard(btn) {
  const card = btn.closest('.teacher-card');
  const key = getTeacherDeleteKey(card);
  const label = key ? getEditorClassLabelFromDom(key) || key : '';
  const impacts = key ? getTeacherDeleteImpacts(key) : [];
  if (impacts.length) {
    state.pendingTeacherDelete = { btn, key };
    setEditorConfirmContent(
      `刪除「${label}」？`,
      '這會移除這個課程，並清空所有使用它的課表格子。',
      impacts.join('\n'),
      '刪除',
      confirmTeacherCardDelete,
      '返回'
    );
    showEditorConfirmSheet();
    return;
  }
  applyTeacherCardDelete(btn);
}

// Exposed on window for inline HTML event handlers (onclick="..." in
// index.html and in generated template strings).
window.addTeacherRow = addTeacherRow;
window.applyAssignments = applyAssignments;
window.assignTeacherFromMenu = assignTeacherFromMenu;
window.closeAssignSheet = closeAssignSheet;
window.deleteTeacherCard = deleteTeacherCard;

export { closeAssignSheet, moveEditorRowToPosition, renderEditorTeachers, updateTeacherCardAvatar };
