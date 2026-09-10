import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// closeTransferSheet (src/editor-core.js) warns before discarding pasted
// backup text that was never actually imported. It used to call
// hasUnconsumedImportData() up to twice per close (once to decide whether to
// warn, again just to know what to tell notifyDiscardedImportData after a
// force-close) - these lock in that the single-call version still warns
// correctly in both the interactive and forced-close paths.

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
});

beforeEach(async () => {
  await window.closeTransferSheet(true);
  window.openTransferSheet();
});

describe('closeTransferSheet with unconsumed pasted text', () => {
  it('shows a discard-confirm sheet instead of closing immediately', async () => {
    const textarea = document.getElementById('settings-transfer-text');
    textarea.value = 'not valid json but non-empty';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    await window.closeTransferSheet();

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('transfer-sheet').classList.contains('show')).toBe(true);
  });

  it('closes immediately when there is nothing pasted', async () => {
    await window.closeTransferSheet();

    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    expect(document.getElementById('transfer-sheet').classList.contains('show')).toBe(false);
  });

  it('force-closing past the warning still clears the field', async () => {
    const textarea = document.getElementById('settings-transfer-text');
    textarea.value = 'not valid json but non-empty';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    await window.closeTransferSheet(true);

    expect(document.getElementById('transfer-sheet').classList.contains('show')).toBe(false);
    expect(textarea.value).toBe('');
  });
});
