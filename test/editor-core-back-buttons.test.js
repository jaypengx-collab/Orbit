import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// ensureEditorBackButtons (src/editor-core.js) adds a "返回課表" row to
// every editor-sheet fold except the ones marked data-no-back-button in
// index.html (the schedule fold itself, and the standalone options fold)
// and anything inside the AI-import preview. Runs once, on window.openEditor().

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  window.openEditor();
});

function hasBackRow(sectionId) {
  return !!document.querySelector(`#${sectionId} .editor-back-row`);
}

describe('ensureEditorBackButtons', () => {
  it('adds a back button to folds reached by drilling in from the schedule', () => {
    expect(hasBackRow('editor-fold-teachers')).toBe(true);
    expect(hasBackRow('editor-fold-bells')).toBe(true);
    expect(hasBackRow('editor-fold-breaks')).toBe(true);
    expect(hasBackRow('editor-fold-countdown')).toBe(true);
  });

  it('does not add a back button to the schedule fold itself or the standalone options fold', () => {
    expect(hasBackRow('editor-fold-schedule')).toBe(false);
    expect(hasBackRow('editor-fold-options')).toBe(false);
  });
});
