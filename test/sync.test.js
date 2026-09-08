import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// No VITE_ORBIT_SYNC_PROXY_URL stub in this file - it exercises sync.js's
// behavior when the feature simply isn't configured (the default for a
// fork, or before the app's owner has deployed the Worker). See
// sync-proxy.test.js for the same module with the proxy configured, which
// covers every push/pull/join/create test that actually needs a fetch call
// - none of that can run here since isSyncProxyConfigured() is false.
let sync;
let state;

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  sync = await import('../src/sync.js');
  ({ state } = await import('../src/state.js'));
});

beforeEach(() => {
  sync.clearSyncPairing();
  document.getElementById('sync-join-code').value = '';
  document.getElementById('sync-join-as-manager').checked = false;
  document.getElementById('sync-join-passcode').value = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sync without a proxy Worker configured', () => {
  it('reports the proxy as not configured', () => {
    expect(sync.isSyncProxyConfigured()).toBe(false);
  });

  it('orbitSyncCreate refuses immediately, with no network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await sync.orbitSyncCreate();
    expect(sync.isSyncConfigured()).toBe(false);
    expect(document.getElementById('sync-status').textContent).toMatch(/尚未設定/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('orbitSyncJoin refuses immediately, with no network call', async () => {
    document.getElementById('sync-join-code').value = 'CODE1234';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await sync.orbitSyncJoin();
    expect(sync.isSyncConfigured()).toBe(false);
    expect(document.getElementById('sync-status').textContent).toMatch(/尚未設定/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('isSyncConfigured / setSyncPairing / clearSyncPairing', () => {
  it('is unconfigured by default and configured once paired', () => {
    expect(sync.isSyncConfigured()).toBe(false);
    sync.setSyncPairing('ABCD1234');
    expect(sync.isSyncConfigured()).toBe(true);
    expect(sync.getSyncCode()).toBe('ABCD1234');
    sync.clearSyncPairing();
    expect(sync.isSyncConfigured()).toBe(false);
  });

  it('clears a legacy self-hosted project id left over from before the proxy was required', () => {
    localStorage.setItem('orbitSyncProjectId', 'some-old-firebase-project');
    sync.setSyncPairing('CODE1234');
    expect(localStorage.getItem('orbitSyncProjectId')).toBeFalsy();
  });
});

describe('the sync panel lives in its own standalone transfer sheet, not the schedule editor', () => {
  // Sync, manual export/import, and AI import all used to live inside the
  // schedule editor (first as a page-layer fold reached via a dedicated
  // drill button, later folded into an always-visible panel at the bottom
  // of the editor); they now live in their own separate #transfer-sheet
  // (see editor-core.js's openTransferSheet), reachable from the top-bar
  // toolbar independently of the schedule editor - see openEditor()'s own
  // isSyncViewer() refusal, which is the whole reason this split exists: a
  // viewer locked out of the schedule editor entirely still needs to reach
  // this sheet.
  it('there is no dedicated "同步" drill button in the schedule editor', () => {
    window.openEditor();
    const labels = [...document.querySelectorAll('.editor-drill-btn')].map(button =>
      button.textContent.trim()
    );
    expect(labels).not.toContain('同步');
  });

  it('the schedule editor no longer contains the sync/import UI at all', () => {
    window.openEditor();
    expect(document.getElementById('editor-sheet').querySelector('#sync-setup-box')).toBeNull();
    expect(document.getElementById('editor-sheet').querySelector('#ocr-import-box')).toBeNull();
  });

  it('openTransferSheet() shows the standalone sheet and contains the sync UI', () => {
    window.openTransferSheet();
    const transfer = document.getElementById('transfer-sheet');
    expect(transfer.classList.contains('show')).toBe(true);
    expect(transfer.querySelector('#sync-setup-box')).toBeTruthy();
    expect(transfer.querySelector('#sync-active-box')).toBeTruthy();
  });

  it('the manual export/import UI is demoted into a nested, collapsed disclosure', () => {
    window.openTransferSheet();
    const legacyFold = document.getElementById('legacy-transfer-fold');
    expect(legacyFold).toBeTruthy();
    expect(legacyFold.open).toBe(false);
    expect(legacyFold.querySelector('#settings-transfer-text')).toBeTruthy();
    // Sync's markup comes before the legacy fold in the sheet, matching
    // "sync is the default, manual backup is the fallback".
    const transfer = document.getElementById('transfer-sheet');
    const syncBox = transfer.querySelector('#sync-setup-box');
    expect(
      syncBox.compareDocumentPosition(legacyFold) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('time simulation is tucked into its own intentionally-activated disclosure, not a toolbar button', () => {
    expect(document.getElementById('btn-test')).toBeNull();
    window.openTransferSheet();
    const testFold = document.getElementById('test-mode-fold');
    expect(testFold).toBeTruthy();
    expect(testFold.open).toBe(false);
  });
});

describe('orbitSyncUnlink', () => {
  it('warns before unlinking and only clears pairing once confirmed', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    sync.orbitSyncUnlink();
    // Nothing happens yet - just the warning sheet, with a chance to copy
    // the code first.
    expect(sync.isSyncConfigured()).toBe(true);
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/解除同步/);
    expect(document.getElementById('editor-confirm-msg').textContent).toMatch(/複製/);
    expect(document.getElementById('editor-import-diff').textContent).toBe('CODE1234');

    const confirmBtn = document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1];
    confirmBtn.onclick();
    expect(sync.isSyncConfigured()).toBe(false);
    expect(document.getElementById('sync-setup-box').hidden).toBe(false);
    expect(document.getElementById('sync-active-box').hidden).toBe(true);
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
  });

  it('cancelling leaves the device still paired', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    sync.orbitSyncUnlink();
    const cancelBtn = document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[0];
    cancelBtn.onclick();
    expect(sync.isSyncConfigured()).toBe(true);
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
  });

  it('the extra button copies the code without closing the sheet or unlinking', async () => {
    // jsdom has neither a real Clipboard API nor execCommand by default -
    // force the fast path in editor-backup.js's copyTransferText so this
    // exercises the actual clipboard.writeText call instead of falling
    // through to a fallback jsdom can't support at all.
    vi.stubGlobal('isSecureContext', true);
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    sync.orbitSyncUnlink();
    const extraBtn = document.getElementById('editor-confirm-extra-btn');
    await extraBtn.onclick();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('CODE1234');
    expect(extraBtn.textContent).toMatch(/已複製/);
    expect(sync.isSyncConfigured()).toBe(true);
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
  });
});

describe('manager/viewer roles', () => {
  it('a device with no manager passcode stored is always a viewer, even with a stray legacy role key', () => {
    sync.setSyncPairing('CODE1234');
    // Left over from the earlier two-code design's role flag - must not
    // matter any more, since role is now derived purely from whether a
    // manager passcode is actually stored (see getSyncRole).
    localStorage.setItem('orbitSyncRole', 'manager');
    expect(sync.getSyncRole()).toBe('viewer');
    expect(sync.isSyncViewer()).toBe(true);
  });

  it('applyEditorRoleLock disables #btn-edit and locks the transfer sheet for a viewer, unlocking both for a manager', () => {
    const editBtn = document.getElementById('btn-edit');
    const transferSheet = document.getElementById('transfer-sheet');
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    expect(editBtn.classList.contains('is-disabled')).toBe(true);
    expect(transferSheet.classList.contains('sync-viewer-locked')).toBe(true);
    expect(document.getElementById('sync-role-label').textContent).toMatch(/僅接收/);

    sync.setSyncPairing('CODE1234', 'PASSCODE1');
    sync.renderSyncPanel();
    expect(editBtn.classList.contains('is-disabled')).toBe(false);
    expect(transferSheet.classList.contains('sync-viewer-locked')).toBe(false);
    expect(document.getElementById('sync-role-label').textContent).toMatch(/管理者/);
  });

  it('openEditor() itself refuses for a viewer, as a second line of defense', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    document.getElementById('editor-sheet').classList.remove('show');
    window.openEditor();
    expect(document.getElementById('editor-sheet').classList.contains('show')).toBe(false);
  });

  it('saveEditor refuses to save while locked as a viewer, as a second line of defense', async () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    document.getElementById('sync-status').textContent = '';
    window.saveEditor();
    expect(document.getElementById('sync-status').textContent).toMatch(/僅接收模式/);
  });

  it('requestTransferAction refuses a manual import while locked as a viewer, but leaves export alone', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    document.getElementById('sync-status').textContent = '';

    window.requestTransferAction('import');
    expect(document.getElementById('sync-status').textContent).toMatch(/僅接收模式/);

    // Export isn't refused by this guard (only 'import' is checked) - it
    // proceeds into the normal async export flow instead of hitting the
    // viewer-refusal message.
    document.getElementById('sync-status').textContent = '';
    window.requestTransferAction('export');
    expect(document.getElementById('sync-status').textContent).toBe('');
  });
});

// getComputedStyle isn't meaningful here - this test harness loads
// index.html's body markup directly (see loadApp.js) without its <link>
// stylesheet, so css/styles.css's actual cascade (including the
// .settings-transfer-box[hidden]{display:none} override this fold added -
// .settings-transfer-box{display:flex} was beating the browser's own
// [hidden]{display:none} at equal specificity, so the setup/active boxes
// never really hid despite `.hidden` being set correctly all along) isn't
// loaded in jsdom at all. What's actually checked below - and was already
// correct before this fold's CSS fix - is that renderSyncPanel()/
// orbitSyncUnlink() flip the `hidden` property itself, immediately and
// without waiting on anything async.
describe('sync-setup-box / sync-active-box hidden-state toggling', () => {
  it('the setup box (create/join fields and buttons) is hidden once paired', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    expect(document.getElementById('sync-setup-box').hidden).toBe(true);
    expect(document.getElementById('sync-active-box').hidden).toBe(false);
  });

  it('confirming the unlink warning re-shows the setup box and hides the active box', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    sync.orbitSyncUnlink();
    const confirmBtn = document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1];
    confirmBtn.onclick();
    expect(document.getElementById('sync-setup-box').hidden).toBe(false);
    expect(document.getElementById('sync-active-box').hidden).toBe(true);
  });
});

describe('orbitSyncSetKeepLocalStyle warns before either direction takes effect', () => {
  beforeEach(() => {
    sync.setSyncPairing('CODE1234');
    document.getElementById('sync-keep-local-style').checked = false;
  });

  it('checking it does nothing until confirmed, and reverts the checkbox on cancel', () => {
    const checkbox = document.getElementById('sync-keep-local-style');
    checkbox.checked = true;
    sync.orbitSyncSetKeepLocalStyle(true);
    expect(sync.getSyncKeepLocalStyle()).toBe(false);
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/不再同步樣式/);

    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[0].onclick(); // 取消
    expect(sync.getSyncKeepLocalStyle()).toBe(false);
    expect(checkbox.checked).toBe(false); // reverted
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
  });

  it('confirming actually checking it takes effect', () => {
    const checkbox = document.getElementById('sync-keep-local-style');
    checkbox.checked = true;
    sync.orbitSyncSetKeepLocalStyle(true);
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick(); // 不再同步樣式
    expect(sync.getSyncKeepLocalStyle()).toBe(true);
    expect(checkbox.checked).toBe(true);
  });

  it('unchecking it also warns first, and reverts the checkbox on cancel', () => {
    sync.setSyncKeepLocalStyle(true);
    const checkbox = document.getElementById('sync-keep-local-style');
    checkbox.checked = false;
    sync.orbitSyncSetKeepLocalStyle(false);
    expect(sync.getSyncKeepLocalStyle()).toBe(true); // unchanged until confirmed
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/恢復同步樣式/);

    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[0].onclick(); // 取消
    expect(sync.getSyncKeepLocalStyle()).toBe(true);
    expect(checkbox.checked).toBe(true); // reverted back to checked
    sync.setSyncKeepLocalStyle(false);
  });

  it('confirming either direction checks sync immediately instead of waiting for the next touch', async () => {
    // No proxy is configured in this file, so the immediate check has
    // nothing to actually push or pull - but it still runs, which is
    // observable as the status line reporting sync isn't set up rather than
    // staying whatever it said before.
    document.getElementById('sync-status').textContent = '';
    const checkbox = document.getElementById('sync-keep-local-style');
    checkbox.checked = true;
    sync.orbitSyncSetKeepLocalStyle(true);
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick();
    await vi.waitFor(() =>
      expect(document.getElementById('sync-status').textContent).toMatch(/尚未設定/)
    );
    sync.setSyncKeepLocalStyle(false);
  });
});

describe('the destructive "resume shared style" direction backs up the local style first', () => {
  beforeEach(() => {
    sync.setSyncPairing('CODE1234');
    document.getElementById('sync-keep-local-style').checked = false;
    sync.orbitSyncDismissStyleBackup(); // clear any backup left over from another test
  });

  it('turning keep-local-style ON does not create a backup', () => {
    const checkbox = document.getElementById('sync-keep-local-style');
    checkbox.checked = true;
    sync.orbitSyncSetKeepLocalStyle(true);
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick();
    expect(sync.getStyleBackup()).toBeNull();
    expect(document.getElementById('sync-style-backup-notice').hidden).toBe(true);
  });

  it('turning keep-local-style OFF backs up the current style, and it can be restored later', () => {
    sync.setSyncKeepLocalStyle(true);
    state.applicationData.proAccent = '#111111';
    state.applicationData.proSecondary = '#222222';
    state.applicationData.proTertiary = '#333333';
    state.applicationData.styleSlots = [{ name: 'Kept', primary: '#111111', secondary: '#222222' }];

    const checkbox = document.getElementById('sync-keep-local-style');
    checkbox.checked = false;
    sync.orbitSyncSetKeepLocalStyle(false);
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick(); // 恢復同步

    expect(sync.getSyncKeepLocalStyle()).toBe(false);
    const backup = sync.getStyleBackup();
    expect(backup.proAccent).toBe('#111111');
    expect(backup.proSecondary).toBe('#222222');
    expect(backup.proTertiary).toBe('#333333');
    expect(backup.styleSlots[0]).toEqual({
      name: 'Kept',
      primary: '#111111',
      secondary: '#222222'
    });
    expect(document.getElementById('sync-style-backup-notice').hidden).toBe(false);

    // Simulate what turning the checkbox off actually does in practice: the
    // very next sync pulls in the shared style and overwrites it.
    state.applicationData.proAccent = '#999999';
    state.applicationData.styleSlots = [
      { name: 'Shared', primary: '#999999', secondary: '#888888' }
    ];

    sync.orbitSyncRestoreStyleBackup();
    expect(state.applicationData.proAccent).toBe('#111111');
    expect(state.applicationData.proSecondary).toBe('#222222');
    expect(state.applicationData.proTertiary).toBe('#333333');
    expect(state.applicationData.styleSlots[0]).toEqual({
      name: 'Kept',
      primary: '#111111',
      secondary: '#222222'
    });
    expect(sync.getSyncKeepLocalStyle()).toBe(true); // re-enabled, so it isn't overwritten right away again
    expect(sync.getStyleBackup()).toBeNull();
    expect(document.getElementById('sync-style-backup-notice').hidden).toBe(true);
    expect(document.getElementById('sync-status').textContent).toMatch(/已還原/);
  });

  it('dismissing the backup clears it without touching the current style', () => {
    sync.setSyncKeepLocalStyle(true);
    state.applicationData.proAccent = '#111111';
    document.getElementById('sync-keep-local-style').checked = false;
    sync.orbitSyncSetKeepLocalStyle(false);
    document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1].onclick();
    expect(sync.getStyleBackup()).not.toBeNull();

    state.applicationData.proAccent = '#999999';
    sync.orbitSyncDismissStyleBackup();
    expect(sync.getStyleBackup()).toBeNull();
    expect(state.applicationData.proAccent).toBe('#999999'); // untouched
    expect(document.getElementById('sync-style-backup-notice').hidden).toBe(true);
  });
});
