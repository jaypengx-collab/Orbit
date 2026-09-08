import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// One real boot is enough (unlike sync-default-project.test.js's env-var
// case, nothing here is read once at module-import time) -
// showOnboardingPrompt() re-checks hasSavedSchedule()/isSyncConfigured()/
// the "seen" flag against live localStorage on every call, so each scenario
// just calls it directly rather than rebooting the whole app per case
// (which, tried initially, thrashed accumulating setInterval timers from
// repeated bootstrap.js boots badly enough to crash the test worker).
let showOnboardingPrompt;

beforeAll(async () => {
  await loadApp();
  ({ showOnboardingPrompt } = await import('../src/onboarding.js'));
});

beforeEach(() => {
  localStorage.removeItem('classFocusData');
  localStorage.removeItem('orbitSyncProjectId');
  localStorage.removeItem('orbitSyncCode');
  localStorage.removeItem('orbitOnboardingSeen');
  hideConfirmSheet();
  document.getElementById('editor-sheet').classList.remove('show');
  document.getElementById('transfer-sheet').classList.remove('show');
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

describe('first-run onboarding prompt', () => {
  it('shows for a brand-new browser (no saved schedule, no sync)', () => {
    showOnboardingPrompt();
    expect(confirmSheetVisible()).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(
      /開始使用 Orbit AI/
    );
  });

  it('does not show for a returning user with a saved schedule', () => {
    seedLocalStorage();
    showOnboardingPrompt();
    expect(confirmSheetVisible()).toBe(false);
  });

  it('does not show for a device already paired to a sync, even with no saved schedule yet', () => {
    localStorage.setItem('orbitSyncProjectId', 'demo-project');
    localStorage.setItem('orbitSyncCode', 'CODE1234');
    showOnboardingPrompt();
    expect(confirmSheetVisible()).toBe(false);
  });

  it('never shows again once already seen, even with still no saved schedule', () => {
    localStorage.setItem('orbitOnboardingSeen', '1');
    showOnboardingPrompt();
    expect(confirmSheetVisible()).toBe(false);
  });

  it('marks itself seen so a second call in the same session is a no-op', () => {
    showOnboardingPrompt();
    expect(confirmSheetVisible()).toBe(true);
    hideConfirmSheet();
    showOnboardingPrompt();
    expect(confirmSheetVisible()).toBe(false);
  });

  it('"輸入配對代碼" opens the standalone transfer sheet with the join field focused', () => {
    showOnboardingPrompt();
    confirmButtons()[1].onclick(); // confirmLabel slot: "輸入配對代碼"

    expect(confirmSheetVisible()).toBe(false);
    expect(document.getElementById('transfer-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-sheet').classList.contains('show')).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('sync-join-code'));
  });

  it('"先自己建立" leads to a second choice between manual setup and AI import', () => {
    showOnboardingPrompt();
    confirmButtons()[0].onclick(); // cancelLabel slot: "先自己建立"

    expect(confirmSheetVisible()).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/怎麼開始/);
  });

  it('the second choice\'s "前往手動建立" just opens the editor', () => {
    showOnboardingPrompt();
    confirmButtons()[0].onclick(); // -> second choice sheet
    confirmButtons()[0].onclick(); // cancelLabel slot: "前往手動建立"

    expect(confirmSheetVisible()).toBe(false);
    expect(document.getElementById('editor-sheet').classList.contains('show')).toBe(true);
  });

  it('the second choice\'s "用 AI 辨識照片" opens the standalone transfer sheet', () => {
    showOnboardingPrompt();
    confirmButtons()[0].onclick(); // -> second choice sheet
    confirmButtons()[1].onclick(); // confirmLabel slot: "用 AI 辨識照片"

    expect(confirmSheetVisible()).toBe(false);
    expect(document.getElementById('transfer-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-sheet').classList.contains('show')).toBe(false);
  });
});
