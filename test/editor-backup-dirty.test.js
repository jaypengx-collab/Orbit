import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';
import { isEditorDirty } from '../src/editor-backup.js';

// isEditorDirty/editorFormSnapshotString intentionally compare *raw* form
// values (including whitespace-only edits and incomplete rows a save would
// normalize away), not the normalized settings shape - a row a save would
// silently drop is still something the user typed, so leaving the editor
// without saving it should still warn. These lock that behavior in.

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
});

beforeEach(() => {
  window.openEditor();
});

describe('isEditorDirty', () => {
  it('is false right after opening the editor with no changes', () => {
    expect(isEditorDirty()).toBe(false);
  });

  it('is true after a whitespace-only edit to a teacher subject', () => {
    const subjectInput = document.querySelector('#teacher-list .teacher-card .tc-subject');
    subjectInput.value = `${subjectInput.value} `;
    expect(isEditorDirty()).toBe(true);
  });

  it('is true after adding a bell row with only a start time filled in', () => {
    window.addBellRow();
    const rows = document.querySelectorAll('#bell-list .bell-row');
    const last = rows[rows.length - 1];
    last.querySelector('.bell-start').value = '17:00';
    last.querySelector('.bell-end').value = '';
    expect(isEditorDirty()).toBe(true);
  });

  it('is true after adding a break row with only a name filled in', () => {
    window.addBreakRow();
    const rows = document.querySelectorAll('#break-list .break-row');
    const last = rows[rows.length - 1];
    last.querySelector('.break-name').value = '新時段';
    last.querySelector('.break-start').value = '';
    last.querySelector('.break-end').value = '';
    expect(isEditorDirty()).toBe(true);
  });

  it('is false again once an edit is undone back to the original value', () => {
    const subjectInput = document.querySelector('#teacher-list .teacher-card .tc-subject');
    const original = subjectInput.value;
    subjectInput.value = `${original}x`;
    expect(isEditorDirty()).toBe(true);
    subjectInput.value = original;
    expect(isEditorDirty()).toBe(false);
  });
});
