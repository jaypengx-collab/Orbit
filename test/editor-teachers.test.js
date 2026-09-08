import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// Fixture (see helpers/fixtureData.js): teachers A/B/C, weeklySchedule
// Monday = [A, B, C], Wednesday = [A, '', ''] - so A is used twice, B and C
// once each, and every existing teacher has at least one schedule impact.

let moveEditorRowToPosition;

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  ({ moveEditorRowToPosition } = await import('../src/editor-teachers.js'));
});

beforeEach(() => {
  window.openEditor();
});

function teacherCard(key) {
  return document.querySelector(`#teacher-list .teacher-card[data-orig-key="${key}"]`);
}

function daySelect(day, period) {
  return document.querySelector(
    `#schedule-grid .schedule-day-row[data-day="${day}"] .period-select[data-period="${period}"]`
  );
}

describe('deleteTeacherCard', () => {
  it('deletes immediately, with no confirm sheet, when the teacher is not used in any schedule slot', () => {
    window.addTeacherRow();
    const newCard = document.querySelector('#teacher-list .teacher-card:last-child');
    const key = newCard.dataset.origKey;
    expect(key).toBeTruthy();

    window.deleteTeacherCard(newCard.querySelector('.delete-btn'));

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(teacherCard(key)).toBeNull();
  });

  it('warns with the impacted schedule slots before deleting a teacher that is in use', () => {
    const card = teacherCard('C'); // used once: Monday period 2
    window.deleteTeacherCard(card.querySelector('.delete-btn'));

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/刪除/);
    expect(document.getElementById('editor-confirm-msg').textContent).toMatch(/清空/);
    expect(document.getElementById('editor-import-diff').textContent).toMatch(/週一第 3 節/);

    // Card and schedule slot both survive until the user actually confirms.
    expect(teacherCard('C')).not.toBeNull();
    expect(daySelect(1, 2).value).toBe('C');
  });

  it('cancelling the delete confirm leaves the teacher and its schedule slot untouched', () => {
    const card = teacherCard('B'); // used once: Monday period 1
    window.deleteTeacherCard(card.querySelector('.delete-btn'));
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[0].onclick(); // 返回

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(teacherCard('B')).not.toBeNull();
    expect(daySelect(1, 1).value).toBe('B');
  });

  it('confirming the delete removes the card and clears every schedule slot that used it', () => {
    const card = teacherCard('A'); // used twice: Monday period 0, Wednesday period 0
    window.deleteTeacherCard(card.querySelector('.delete-btn'));
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick(); // 刪除

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(teacherCard('A')).toBeNull();
    expect(daySelect(1, 0).value).toBe('');
    expect(daySelect(3, 0).value).toBe('');
    // Untouched slots for the other teachers survive.
    expect(daySelect(1, 1).value).toBe('B');
  });
});

describe('moveEditorRowToPosition', () => {
  it('reorders teacher cards and renumbers every .order-position input to match', () => {
    const cardA = teacherCard('A');
    moveEditorRowToPosition(cardA, '3', '#teacher-list .teacher-card');

    const keysInOrder = [...document.querySelectorAll('#teacher-list .teacher-card')].map(
      card => card.dataset.origKey
    );
    expect(keysInOrder).toEqual(['B', 'C', 'A']);

    const positions = [...document.querySelectorAll('#teacher-list .order-position')].map(
      input => input.value
    );
    expect(positions).toEqual(['1', '2', '3']);
  });
});

describe('assignment overwrite confirm (assignTeacherFromMenu / assignToSlot / applyAssignments)', () => {
  it('assigns directly into an empty slot with no confirm needed', () => {
    window.assignTeacherFromMenu(teacherCard('C').querySelector('.teacher-assign'));
    expect(document.getElementById('assign-sheet').classList.contains('show')).toBe(true);

    // Tuesday has no assignments in the fixture - period 0 is empty.
    document.querySelector('#assign-day-tabs .assign-day-tab[data-day="2"]').click();
    const emptyBox = document.querySelector('#assign-grid .assign-box[data-slot="2:0"]');
    emptyBox.click();

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(emptyBox.classList.contains('assigned')).toBe(true);
  });

  it('warns before overwriting a slot already used by a different class, and leaves it unchanged on cancel', () => {
    window.assignTeacherFromMenu(teacherCard('A').querySelector('.teacher-assign'));
    // Monday period 1 is already "B" in the fixture.
    document.querySelector('#assign-grid .assign-box[data-slot="1:1"]').click();

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/覆蓋這個時段/);
    expect(document.getElementById('editor-confirm-msg').textContent).toMatch(/第 2 節/);

    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[0].onclick(); // 返回
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    // Cancelling only dismisses the sheet - the underlying schedule select is untouched either way.
    expect(daySelect(1, 1).value).toBe('B');
  });

  it('confirming the overwrite and applying writes the new assignment back into the real schedule grid', () => {
    window.assignTeacherFromMenu(teacherCard('A').querySelector('.teacher-assign'));
    document.querySelector('#assign-grid .assign-box[data-slot="1:1"]').click();
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick(); // 確定覆蓋

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    const box = document.querySelector('#assign-grid .assign-box[data-slot="1:1"]');
    expect(box.classList.contains('assigned')).toBe(true);

    window.applyAssignments();
    expect(document.getElementById('assign-sheet').classList.contains('show')).toBe(false);
    expect(daySelect(1, 1).value).toBe('A');
  });
});
