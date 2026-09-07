import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

// A separate file (its own module registry, per Vitest's per-file isolation
// - see loadApp.js's comment) so sync.js's module-scope
// `import.meta.env.VITE_ORBIT_SYNC_PROJECT_ID` read picks up this stub: it's
// only read once, at import time, so it must be set before loadApp() first
// pulls sync.js in via main.js -> bootstrap.js.
let sync;

beforeAll(async () => {
  vi.stubEnv('VITE_ORBIT_SYNC_PROJECT_ID', 'demo-shared-project');
  seedLocalStorage();
  await loadApp();
  sync = await import('../src/sync.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('sync with a build-time default project id configured', () => {
  it('reports a default project id and uses it without any local pairing', () => {
    expect(sync.hasDefaultSyncProjectId()).toBe(true);
    expect(sync.getSyncProjectId()).toBe('demo-shared-project');
  });

  it('hides the manual project-id field and shows the zero-setup hint', () => {
    sync.renderSyncPanel();
    expect(document.getElementById('sync-project-id').hidden).toBe(true);
    expect(document.getElementById('sync-setup-hint').textContent).toMatch(
      /不需要自己申請任何帳號/
    );
  });

  it('orbitSyncCreate pairs using the default project id with no project-id input filled in', async () => {
    document.getElementById('sync-project-id').value = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ updateTime: 'now' }) }))
    );
    await sync.orbitSyncCreate();
    expect(sync.isSyncConfigured()).toBe(true);
    expect(sync.getSyncProjectId()).toBe('demo-shared-project');
    vi.unstubAllGlobals();
    sync.clearSyncPairing();
  });
});
