import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// Fixture (see helpers/fixtureData.js): bellTimes has 3 periods
// (08:00-08:50, 09:10-10:00, 10:10-11:00); weeklySchedule uses all three on
// Monday (A/B/C) and period 0 again on Wednesday (A).

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
});

beforeEach(() => {
  window.openEditor();
});

function bellRow(number) {
  return document.querySelectorAll('#bell-list .bell-row')[number - 1];
}

function daySelect(day, period) {
  return document.querySelector(
    `#schedule-grid .schedule-day-row[data-day="${day}"] .period-select[data-period="${period}"]`
  );
}

describe('deleteBellRow', () => {
  it('deletes immediately, with no confirm sheet, when the period is unused in every day', () => {
    // A freshly-added 4th period starts unassigned in every day's grid.
    window.addBellRow();
    window.deleteBellRow(bellRow(4).querySelector('.delete-btn'));

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(document.querySelectorAll('#bell-list .bell-row')).toHaveLength(3);
  });

  it('warns with the impacted schedule slots before deleting a period that is in use', () => {
    // Period 1 (index 0) is used on both Monday and Wednesday in the fixture.
    window.deleteBellRow(bellRow(1).querySelector('.delete-btn'));

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/刪除第 1 節/);
    expect(document.getElementById('editor-confirm-msg').textContent).toMatch(/往前移/);
    const diff = document.getElementById('editor-import-diff').textContent;
    expect(diff).toMatch(/週一第 1 節/);
    expect(diff).toMatch(/週三第 1 節/);

    // Nothing removed yet.
    expect(document.querySelectorAll('#bell-list .bell-row')).toHaveLength(3);
  });

  it('cancelling leaves the bell row and schedule grid untouched', () => {
    window.deleteBellRow(bellRow(1).querySelector('.delete-btn'));
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[0].onclick(); // 返回

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(document.querySelectorAll('#bell-list .bell-row')).toHaveLength(3);
    expect(daySelect(1, 0).value).toBe('A');
  });

  it('confirming removes the bell row and the matching period column from every day', () => {
    window.deleteBellRow(bellRow(1).querySelector('.delete-btn'));
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick(); // 刪除

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(document.querySelectorAll('#bell-list .bell-row')).toHaveLength(2);
    // What used to be period 1 (A) is gone; the old period 2 (B) shifts down
    // into index 0.
    expect(daySelect(1, 0).value).toBe('B');
  });
});

describe('saveEditor: time-conflict guard', () => {
  it('blocks saving and explains the overlap when two bell periods are made to overlap', () => {
    // Move period 2's start (09:10) earlier than period 1's end (08:50).
    bellRow(2).querySelector('.bell-start').value = '08:30';

    window.saveEditor();

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/時間有重疊/);
    expect(document.getElementById('editor-confirm-msg').textContent).toMatch(/避免.*重疊/);
    expect(document.getElementById('editor-import-diff').textContent).toMatch(/時間衝突/);
  });

  it('proceeds to the save-confirm sheet once times no longer overlap', () => {
    window.saveEditor();

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/要儲存嗎/);
  });
});
