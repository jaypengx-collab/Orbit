import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
});

function hideConfirmSheet() {
  document.getElementById('editor-confirm-sheet').classList.remove('show');
  document.getElementById('editor-confirm-overlay').classList.remove('show');
}
function confirmSheetVisible() {
  return document.getElementById('editor-confirm-sheet').classList.contains('show');
}
function confirmButtons() {
  return document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn');
}

afterEach(() => {
  hideConfirmSheet();
  document.getElementById('settings-transfer-text').value = '';
  vi.restoreAllMocks();
});

describe('the manual-import textarea no longer has a hidden "reset" trick', () => {
  it('treats the literal word "reset" as ordinary (invalid) import content, not a factory reset', async () => {
    const clearSpy = vi.spyOn(Storage.prototype, 'clear');
    document.getElementById('settings-transfer-text').value = 'reset';
    window.requestTransferAction('import');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(clearSpy).not.toHaveBeenCalled();
    expect(document.getElementById('settings-transfer-status').textContent).toMatch(/匯入失敗/);
  });
});

describe('resetAllAppData: a full local factory reset, now a real confirmed button', () => {
  it('shows a confirmation sheet instead of clearing anything immediately', () => {
    const clearSpy = vi.spyOn(Storage.prototype, 'clear');
    window.resetAllAppData();

    expect(confirmSheetVisible()).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/重設所有資料/);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('"取消" backs out without clearing anything', () => {
    const clearSpy = vi.spyOn(Storage.prototype, 'clear');
    window.resetAllAppData();
    confirmButtons()[0].onclick(); // cancelLabel slot: "取消"

    expect(confirmSheetVisible()).toBe(false);
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('confirming clears localStorage and reloads the page', () => {
    const clearSpy = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {});
    // jsdom's window.location.reload isn't a configurable own property, so
    // spyOn can't replace it directly - spying on the `location` accessor
    // itself and swapping in a stand-in object works instead.
    const reloadSpy = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload: reloadSpy });
    window.resetAllAppData();
    confirmButtons()[1].onclick(); // confirmLabel slot: "重設"

    expect(clearSpy).toHaveBeenCalled();
    expect(reloadSpy).toHaveBeenCalled();
  });
});
