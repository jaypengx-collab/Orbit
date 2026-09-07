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
  document.getElementById('sync-join-as-manager').checked = false;
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

describe('manager/viewer roles', () => {
  it('a device paired before roles existed defaults to manager (no retroactive lockout)', () => {
    sync.setSyncPairing('demo-project', 'CODE1234');
    localStorage.removeItem('orbitSyncRole');
    expect(sync.getSyncRole()).toBe('manager');
    expect(sync.isSyncViewer()).toBe(false);
  });

  it('orbitSyncCreate always pairs this device as manager', async () => {
    document.getElementById('sync-project-id').value = 'demo-project';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ updateTime: 'now' }) }))
    );
    await sync.orbitSyncCreate();
    expect(sync.getSyncRole()).toBe('manager');
    expect(sync.isSyncViewer()).toBe(false);
  });

  it('orbitSyncJoin defaults to viewer and never publishes local data to an empty code', async () => {
    document.getElementById('sync-project-id').value = 'demo-project';
    document.getElementById('sync-join-code').value = 'EMPTY123';
    const fetchMock = vi.fn(async (url, options) => {
      // Only a GET (the pull) is expected - a viewer must never PATCH.
      expect(options?.method).not.toBe('PATCH');
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', fetchMock);
    await sync.orbitSyncJoin();
    expect(sync.isSyncConfigured()).toBe(true);
    expect(sync.isSyncViewer()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('orbitSyncJoin pairs as manager when "以管理者身份加入" is checked, and may publish', async () => {
    document.getElementById('sync-project-id').value = 'demo-project';
    document.getElementById('sync-join-code').value = 'EMPTY123';
    document.getElementById('sync-join-as-manager').checked = true;
    const fetchMock = vi.fn(async (url, options) => {
      if (options?.method === 'PATCH')
        return { ok: true, json: async () => ({ updateTime: 'now' }) };
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', fetchMock);
    await sync.orbitSyncJoin();
    expect(sync.isSyncViewer()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('syncTick only pulls for a viewer, even when the local schedule has "changed"', async () => {
    sync.setSyncPairing('demo-project', 'CODE1234', 'viewer');
    const fetchMock = vi.fn(async (url, options) => {
      expect(options?.method).not.toBe('PATCH');
      return { status: 404, ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);
    await sync.syncTick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('applyEditorRoleLock locks the editor sheet for a viewer and unlocks it for a manager', () => {
    window.openEditor();
    const sheet = document.getElementById('editor-sheet');
    sync.setSyncPairing('demo-project', 'CODE1234', 'viewer');
    sync.renderSyncPanel();
    expect(sheet.classList.contains('sync-viewer-locked')).toBe(true);
    expect(document.getElementById('sync-role-label').textContent).toMatch(/僅接收/);

    sync.setSyncPairing('demo-project', 'CODE1234', 'manager');
    sync.renderSyncPanel();
    expect(sheet.classList.contains('sync-viewer-locked')).toBe(false);
    expect(document.getElementById('sync-role-label').textContent).toMatch(/管理者/);
  });

  it('saveEditor refuses to save while locked as a viewer, as a second line of defense', async () => {
    sync.setSyncPairing('demo-project', 'CODE1234', 'viewer');
    sync.renderSyncPanel();
    document.getElementById('sync-status').textContent = '';
    window.saveEditor();
    expect(document.getElementById('sync-status').textContent).toMatch(/僅接收模式/);
  });
});
