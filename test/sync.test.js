import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

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
  document.getElementById('sync-project-id').value = '';
  document.getElementById('sync-join-code').value = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    sync.setSyncPairing('demo-project', 'abcd1234');
    expect(sync.isSyncConfigured()).toBe(true);
    expect(sync.getSyncProjectId()).toBe('demo-project');
    expect(sync.getSyncCode()).toBe('ABCD1234');
    sync.clearSyncPairing();
    expect(sync.isSyncConfigured()).toBe(false);
  });
});

describe('pushSyncSnapshot', () => {
  it('PATCHes the Firestore doc for the paired project/code with the compressed backup as payload', async () => {
    sync.setSyncPairing('demo-project', 'CODE1234');
    const fetchMock = vi.fn(async (url, options) => {
      expect(url).toBe(
        'https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents/orbit-schedules/CODE1234?updateMask.fieldPaths=payload'
      );
      expect(options.method).toBe('PATCH');
      const body = JSON.parse(options.body);
      expect(body.fields.payload.stringValue.startsWith('[ORBIT]')).toBe(true);
      return {
        ok: true,
        json: async () => ({ updateTime: '2024-01-15T00:00:00.000000Z' })
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sync.pushSyncSnapshot();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an error when not paired', async () => {
    const result = await sync.pushSyncSnapshot();
    expect(result.ok).toBe(false);
  });

  it('surfaces the Firestore error message on a failed request', async () => {
    sync.setSyncPairing('demo-project', 'CODE1234');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { message: 'PERMISSION_DENIED' } })
      }))
    );
    const result = await sync.pushSyncSnapshot();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/PERMISSION_DENIED/);
  });
});

describe('pullSyncSnapshot', () => {
  it('treats a missing document (404) as nothing to apply yet', async () => {
    sync.setSyncPairing('demo-project', 'CODE1234');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 404, ok: false }))
    );
    const result = await sync.pullSyncSnapshot();
    expect(result).toEqual({ ok: true, applied: false });
  });

  it('applies a remote payload that differs from the current schedule', async () => {
    sync.setSyncPairing('demo-project', 'CODE1234');
    const { encodeTransferData, normalizeSettingsData } = await import('../src/editor-backup.js');
    const remoteData = normalizeSettingsData({
      ...state.applicationData,
      teacherDB: { ...state.applicationData.teacherDB, Z: ['地理', '新老師', ''] }
    });
    const payload = await encodeTransferData(remoteData);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          updateTime: '2024-02-01T00:00:00.000000Z',
          fields: { payload: { stringValue: payload } }
        })
      }))
    );
    const result = await sync.pullSyncSnapshot();
    expect(result).toEqual({ ok: true, applied: true });
    expect(state.applicationData.teacherDB.Z).toEqual(['地理', '新老師', '']);
  });

  it('does not apply when the remote updateTime matches what was already synced', async () => {
    sync.setSyncPairing('demo-project', 'CODE1234');
    const { encodeTransferData } = await import('../src/editor-backup.js');
    const payload = await encodeTransferData(state.applicationData);
    localStorage.setItem('orbitSyncLastUpdateTime', '2024-02-01T00:00:00.000000Z');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        updateTime: '2024-02-01T00:00:00.000000Z',
        fields: { payload: { stringValue: payload } }
      })
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await sync.pullSyncSnapshot();
    expect(result).toEqual({ ok: true, applied: false });
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

describe('orbitSyncCreate / orbitSyncJoin / orbitSyncUnlink UI wiring', () => {
  it('orbitSyncCreate requires a project id before pairing', async () => {
    await sync.orbitSyncCreate();
    expect(sync.isSyncConfigured()).toBe(false);
    expect(document.getElementById('sync-status').textContent).toMatch(/專案 ID/);
  });

  it('orbitSyncCreate pairs and publishes the current schedule on success', async () => {
    document.getElementById('sync-project-id').value = 'demo-project';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ updateTime: 'now' }) }))
    );
    await sync.orbitSyncCreate();
    expect(sync.isSyncConfigured()).toBe(true);
    expect(document.getElementById('sync-active-box').hidden).toBe(false);
    expect(document.getElementById('sync-active-code').textContent).toBe(sync.getSyncCode());
  });

  it('orbitSyncUnlink clears pairing and restores the setup panel', () => {
    sync.setSyncPairing('demo-project', 'CODE1234');
    sync.renderSyncPanel();
    sync.orbitSyncUnlink();
    expect(sync.isSyncConfigured()).toBe(false);
    expect(document.getElementById('sync-setup-box').hidden).toBe(false);
    expect(document.getElementById('sync-active-box').hidden).toBe(true);
  });
});
