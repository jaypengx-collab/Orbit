import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// Regression test for a real bug found while UX-testing the app: opening
// Test Mode while the editor has unsaved changes goes through
// toggleTestPanel() -> showEditorDiscardConfirm() -> (user clicks discard)
// -> applyPendingSheetAfterDiscard('test') -> window.openTestPanel(), and
// that last call used to throw ("Cannot read properties of undefined
// (reading 'apply')") because dashboard.js never bound window.openTestPanel
// - only window.toggleTestPanel - so testsim-runtime.js's patchPanelOpeners()
// wrapped `undefined` instead of the real function.

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
});

beforeEach(() => {
  window.closeTestPanel();
  window.openEditor();
});

describe('opening Test Mode while the editor has unsaved changes', () => {
  it('discarding the unsaved change opens Test Mode instead of throwing', async () => {
    const subjectInput = document.querySelector('#teacher-list .tc-subject');
    subjectInput.value = `${subjectInput.value}x`;

    await window.toggleTestPanel();
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);

    const confirmBtn = document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1];
    expect(() => confirmBtn.onclick()).not.toThrow();

    expect(document.getElementById('debug-panel').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-sheet').classList.contains('show')).toBe(false);
  });
});
