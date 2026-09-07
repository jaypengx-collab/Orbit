import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// A separate file (its own module registry, per Vitest's per-file isolation
// - see loadApp.js's comment) so sync.js's module-scope
// `import.meta.env.VITE_ORBIT_SYNC_PROXY_URL` read picks up this stub: it's
// only read once, at import time, so it must be set before loadApp() first
// pulls sync.js in via main.js -> bootstrap.js.
let sync;
let state;
const PROXY_URL = 'https://sync-proxy.example.workers.dev/';

beforeAll(async () => {
  vi.stubEnv('VITE_ORBIT_SYNC_PROXY_URL', PROXY_URL);
  seedLocalStorage();
  await loadApp();
  sync = await import('../src/sync.js');
  ({ state } = await import('../src/state.js'));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sync.clearSyncPairing();
});

describe('sync with a build-time proxy URL configured', () => {
  it('reports a managed deployment with no project id needed', () => {
    expect(sync.hasSyncProxy()).toBe(true);
    expect(sync.isManagedSyncDeployment()).toBe(true);
  });

  it('hides the manual project-id field and shows the zero-setup hint', () => {
    sync.renderSyncPanel();
    expect(document.getElementById('sync-project-id').hidden).toBe(true);
    expect(document.getElementById('sync-setup-hint').textContent).toMatch(
      /不需要自己申請任何帳號/
    );
  });

  it('orbitSyncCreate pairs with no project-id input filled in, PATCHing the proxy with a plain {payload} body', async () => {
    document.getElementById('sync-project-id').value = '';
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ updateTime: 'now' }) }));
    vi.stubGlobal('fetch', fetchMock);

    await sync.orbitSyncCreate();

    expect(sync.isSyncConfigured()).toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${PROXY_URL}?code=${sync.getSyncCode()}`);
    expect(options.method).toBe('PATCH');
    const body = JSON.parse(options.body);
    expect(typeof body.payload).toBe('string');
    expect(body.payload.startsWith('[ORBIT]')).toBe(true);
    expect(document.getElementById('sync-active-box').hidden).toBe(false);
  });

  it('pullSyncSnapshot treats {exists:false} from the proxy as nothing to apply yet', async () => {
    sync.setSyncPairing('', 'CODE1234');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ exists: false }) }))
    );
    const result = await sync.pullSyncSnapshot();
    expect(result).toEqual({ ok: true, applied: false, exists: false });
  });

  it('pullSyncSnapshot applies a remote payload the proxy reports as existing', async () => {
    sync.setSyncPairing('', 'CODE1234');
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
        json: async () => ({ exists: true, updateTime: '2024-02-01T00:00:00.000000Z', payload })
      }))
    );
    const result = await sync.pullSyncSnapshot();
    expect(result).toEqual({ ok: true, applied: true, exists: true });
    expect(state.applicationData.teacherDB.Z).toEqual(['地理', '新老師', '']);
  });

  it('a 429 from the proxy surfaces as the same friendly rate-limit message on push', async () => {
    sync.setSyncPairing('', 'CODE1234');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: '請求過於頻繁，請稍後再試。' } })
      }))
    );
    const result = await sync.pushSyncSnapshot();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/請求過於頻繁/);
  });

  it('orbitSyncJoin checks existence via the proxy before ever showing the overwrite confirmation', async () => {
    document.getElementById('sync-join-code').value = 'CODE1234';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ exists: false })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await sync.orbitSyncJoin();

    expect(sync.isSyncConfigured()).toBe(false);
    expect(document.getElementById('sync-status').textContent).toMatch(/找不到這組配對代碼/);
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(false);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${PROXY_URL}?code=CODE1234`);
  });

  it('orbitSyncJoin pairs once the proxy confirms the code exists and the confirm button is clicked', async () => {
    document.getElementById('sync-join-code').value = 'CODE1234';
    const { encodeTransferData } = await import('../src/editor-backup.js');
    const payload = await encodeTransferData(state.applicationData);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ exists: true, updateTime: 'now', payload })
      }))
    );

    await sync.orbitSyncJoin();
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    const confirmBtn = document.querySelectorAll('#editor-confirm-sheet .editor-confirm-btn')[1];
    confirmBtn.onclick();
    await Promise.resolve();
    await Promise.resolve();

    expect(sync.isSyncConfigured()).toBe(true);
  });
});
