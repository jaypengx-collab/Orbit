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

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  sync = await import('../src/sync.js');
});

beforeEach(() => {
  sync.clearSyncPairing();
  document.getElementById('sync-join-code').value = '';
  document.getElementById('sync-join-as-manager').checked = false;
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

describe('generateSyncCode', () => {
  it('produces an 8-character code from the unambiguous alphabet only', () => {
    const code = sync.generateSyncCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(code).not.toMatch(/[01OI]/);
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

describe('the sync panel is merged into import/export, not a separate paged fold', () => {
  // Sync used to be its own page-layer fold reached via a dedicated drill
  // button; it's now folded into editor-fold-transfer, the always-visible
  // tools panel at the bottom of the editor (see editor-core.js's
  // moveEditorControlsIntoLayers/openEditorFold, which both special-case
  // that panel so it never gets hidden by the paged schedule/teachers/bells
  // navigation). So there's no separate drill button or fold id to check
  // for any more - just that the sync UI lives inside that always-visible
  // panel as its default option, ahead of the demoted manual-backup fold.
  it('there is no dedicated "同步" drill button any more', () => {
    window.openEditor();
    const labels = [...document.querySelectorAll('.editor-drill-btn')].map(button =>
      button.textContent.trim()
    );
    expect(labels).not.toContain('同步');
  });

  it('editor-fold-transfer is the always-visible tools panel and contains the sync UI', () => {
    window.openEditor();
    const transfer = document.getElementById('editor-fold-transfer');
    expect(transfer.classList.contains('editor-save-tools')).toBe(true);
    expect(transfer.querySelector('#sync-setup-box')).toBeTruthy();
    expect(transfer.querySelector('#sync-active-box')).toBeTruthy();
  });

  it('the manual export/import UI is demoted into a nested, collapsed disclosure', () => {
    window.openEditor();
    const legacyFold = document.getElementById('legacy-transfer-fold');
    expect(legacyFold).toBeTruthy();
    expect(legacyFold.open).toBe(false);
    expect(legacyFold.querySelector('#settings-transfer-text')).toBeTruthy();
    // Sync's markup comes before the legacy fold in the panel body, matching
    // "sync is the default, manual backup is the fallback".
    const transfer = document.getElementById('editor-fold-transfer');
    const syncBox = transfer.querySelector('#sync-setup-box');
    expect(
      syncBox.compareDocumentPosition(legacyFold) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('orbitSyncUnlink', () => {
  it('clears pairing and restores the setup panel', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    sync.orbitSyncUnlink();
    expect(sync.isSyncConfigured()).toBe(false);
    expect(document.getElementById('sync-setup-box').hidden).toBe(false);
    expect(document.getElementById('sync-active-box').hidden).toBe(true);
  });
});

describe('manager/viewer roles', () => {
  it('a device paired before roles existed defaults to manager (no retroactive lockout)', () => {
    sync.setSyncPairing('CODE1234');
    localStorage.removeItem('orbitSyncRole');
    expect(sync.getSyncRole()).toBe('manager');
    expect(sync.isSyncViewer()).toBe(false);
  });

  it('applyEditorRoleLock locks the editor sheet for a viewer and unlocks it for a manager', () => {
    window.openEditor();
    const sheet = document.getElementById('editor-sheet');
    sync.setSyncPairing('CODE1234', 'viewer');
    sync.renderSyncPanel();
    expect(sheet.classList.contains('sync-viewer-locked')).toBe(true);
    expect(document.getElementById('sync-role-label').textContent).toMatch(/僅接收/);

    sync.setSyncPairing('CODE1234', 'manager');
    sync.renderSyncPanel();
    expect(sheet.classList.contains('sync-viewer-locked')).toBe(false);
    expect(document.getElementById('sync-role-label').textContent).toMatch(/管理者/);
  });

  it('saveEditor refuses to save while locked as a viewer, as a second line of defense', async () => {
    sync.setSyncPairing('CODE1234', 'viewer');
    sync.renderSyncPanel();
    document.getElementById('sync-status').textContent = '';
    window.saveEditor();
    expect(document.getElementById('sync-status').textContent).toMatch(/僅接收模式/);
  });

  it('requestTransferAction refuses a manual import while locked as a viewer, but leaves export alone', () => {
    sync.setSyncPairing('CODE1234', 'viewer');
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

  it('unlinking immediately re-shows the setup box and hides the active box', () => {
    sync.setSyncPairing('CODE1234');
    sync.renderSyncPanel();
    sync.orbitSyncUnlink();
    expect(document.getElementById('sync-setup-box').hidden).toBe(false);
    expect(document.getElementById('sync-active-box').hidden).toBe(true);
  });
});
