import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

let applyOfflineLock;

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  ({ applyOfflineLock } = await import('../src/editor-core.js'));
});

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnline(true);
  applyOfflineLock();
});

describe('applyOfflineLock: AI import and setting up sync need a real connection', () => {
  it('locks the editor sheet and shows a status message when offline', () => {
    setOnline(false);
    applyOfflineLock();
    expect(document.getElementById('transfer-sheet').classList.contains('is-offline')).toBe(true);
    expect(document.getElementById('ocr-import-status').textContent).toMatch(/沒有網路連線/);
    expect(document.getElementById('sync-status').textContent).toMatch(/沒有網路連線/);
  });

  it('unlocks and clears its own message once back online', () => {
    setOnline(false);
    applyOfflineLock();
    setOnline(true);
    applyOfflineLock();
    expect(document.getElementById('transfer-sheet').classList.contains('is-offline')).toBe(false);
    expect(document.getElementById('ocr-import-status').textContent).toBe('');
    expect(document.getElementById('sync-status').textContent).toBe('');
  });

  it('does not clobber a newer, unrelated status message when coming back online', () => {
    setOnline(false);
    applyOfflineLock();
    document.getElementById('sync-status').textContent = '同步下載失敗：某個別的錯誤';
    setOnline(true);
    applyOfflineLock();
    expect(document.getElementById('sync-status').textContent).toBe('同步下載失敗：某個別的錯誤');
  });

  it('openTransferSheet() itself applies the lock the moment the sheet opens', () => {
    setOnline(false);
    window.openTransferSheet();
    expect(document.getElementById('transfer-sheet').classList.contains('is-offline')).toBe(true);
  });
});
