import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/loadApp.js';
import { seedLocalStorage } from './helpers/fixtureData.js';

let state;
let openStylePanel;

beforeAll(async () => {
  seedLocalStorage();
  await loadApp();
  ({ state } = await import('../src/state.js'));
  ({ openStylePanel } = await import('../src/appearance.js'));
});

beforeEach(() => {
  openStylePanel(true);
});

describe('style panel: saving a preset slot marks the draft dirty', () => {
  it('is not dirty right after opening', () => {
    expect(document.getElementById('style-panel').classList.contains('style-draft-dirty')).toBe(
      false
    );
  });

  // The bug this covers: saveStyleSlotDraft() used to mutate
  // state.stylePanelDraft.styleSlots without marking the panel dirty, so
  // closeStylePanel() saw nothing to warn about and closed immediately -
  // silently losing the slot save the next time renderStylePanel() rebuilt
  // the draft fresh from the (still unchanged) applicationData.
  it('saving an empty slot marks the panel dirty and blocks closing without a warning', () => {
    window.saveStyleSlot(0);
    expect(document.getElementById('style-panel').classList.contains('style-draft-dirty')).toBe(
      true
    );

    window.closeStylePanel();
    expect(document.getElementById('style-panel').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-sheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('editor-confirm-title').textContent).toMatch(/尚未套用樣式/);
  });

  it('saving over an already-named slot also marks the panel dirty once confirmed', () => {
    window.saveStyleSlot(1);
    document
      .getElementById('editor-confirm-sheet')
      .querySelectorAll('.editor-confirm-btn')[1]
      .onclick?.(); // confirm "覆寫"
    window.saveStyleSlot(1);
    expect(document.getElementById('style-panel').classList.contains('style-draft-dirty')).toBe(
      true
    );
  });

  it('loading a preset slot (the already-correct path) also marks the panel dirty', () => {
    window.saveStyleSlot(0);
    window.closeStylePanel(); // dismiss the warning sheet without actually closing
    document
      .getElementById('editor-confirm-sheet')
      .querySelectorAll('.editor-confirm-btn')[0]
      .onclick?.(); // "返回" - keep editing
    window.loadStyleSlot(0);
    document
      .getElementById('editor-confirm-sheet')
      .querySelectorAll('.editor-confirm-btn')[1]
      .onclick(); // "套用"
    expect(document.getElementById('style-panel').classList.contains('style-draft-dirty')).toBe(
      true
    );
  });
});

describe('state', () => {
  it('sanity: style panel draft exists once opened', () => {
    expect(state.stylePanelDraft).toBeTruthy();
  });
});

describe('style tool lock: a viewer still accepting synced colors cannot use it', () => {
  let sync;

  beforeAll(async () => {
    sync = await import('../src/sync.js');
  });

  afterEach(() => {
    sync.clearSyncPairing();
  });

  it("window.toggleStylePanel() refuses to open the panel for a plain viewer (hasn't opted out)", async () => {
    window.closeStylePanel(); // start from a known-closed state
    sync.setSyncPairing('CODE1234', 'viewer');
    await window.toggleStylePanel();
    expect(document.getElementById('style-panel').classList.contains('show')).toBe(false);
  });

  it('#btn-style is visually locked for a plain viewer, and unlocks the moment the opt-out is checked', () => {
    sync.setSyncPairing('CODE1234', 'viewer');
    sync.applyEditorRoleLock();
    expect(document.getElementById('btn-style').classList.contains('is-disabled')).toBe(true);

    sync.orbitSyncSetKeepLocalStyle(true);
    expect(document.getElementById('btn-style').classList.contains('is-disabled')).toBe(false);
    sync.setSyncKeepLocalStyle(false);
  });

  it('a manager is never locked out of the style tool, opted out or not', async () => {
    window.closeStylePanel();
    sync.setSyncPairing('CODE1234', 'manager');
    sync.applyEditorRoleLock();
    expect(document.getElementById('btn-style').classList.contains('is-disabled')).toBe(false);
    await window.toggleStylePanel();
    expect(document.getElementById('style-panel').classList.contains('show')).toBe(true);
  });
});
