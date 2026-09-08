// ---- src/sync.js ----
// Optional cross-device sync: mirrors the already-saved schedule
// (state.applicationData) to a Firestore document and polls it for changes
// made from other devices. Reuses the same compressed v2 backup string the
// manual export/import flow already produces (editor-backup.js) as the
// document payload, so this is really "auto-paste the export text into a
// shared doc, auto-import it elsewhere" rather than a separate data format.
//
// No server of Orbit's own, in the sense that end users never run or pay
// for anything: every read/write goes through a Cloudflare Worker (see
// cloudflare-worker/orbit-worker.js's /sync path, VITE_ORBIT_SYNC_PROXY_URL)
// that the app's owner - not each user - deploys once. The Worker holds its
// own Firebase service-account credentials server-side and applies real,
// cross-request rate limiting, then proxies to Firestore - the same
// reasoning as gemini-ocr.js talking to the Gemini proxy instead of Gemini
// directly. A device only ever needs a pairing code; nothing here proves
// who the caller is, so the pairing code is the only access control on top
// of whatever the Worker itself enforces - see README for the full design.
//
// This feature simply doesn't work without VITE_ORBIT_SYNC_PROXY_URL set
// (see isSyncProxyConfigured) - same as gemini-ocr.js's AI import without
// its own proxy URL. There's no fallback to talking to Firestore directly
// from the browser any more: that path had no real rate limiting (Firestore
// rules can validate a request's shape but can't count requests), so it
// only ever made sense as a stopgap before this Worker existed.
import { state } from './state.js';
import {
  applyEditorSettingsData,
  copyTransferText,
  decodeTransferData,
  encodeTransferData,
  isEditorDirty,
  normalizeSettingsData
} from './editor-backup.js';
import {
  hideEditorDiscardConfirm,
  setEditorConfirmContent,
  showEditorConfirmSheet
} from './editor-core.js';

const SYNC_PROXY_URL = (import.meta.env.VITE_ORBIT_SYNC_PROXY_URL || '').trim();
const CODE_KEY = 'orbitSyncCode';
const ROLE_KEY = 'orbitSyncRole';
const LAST_UPDATE_TIME_KEY = 'orbitSyncLastUpdateTime';
// Left over from before this feature required the proxy Worker, when a
// device could pair against a self-typed Firebase project id - cleared
// opportunistically below so an old pairing doesn't leave a stale value
// sitting in localStorage forever.
const LEGACY_PROJECT_ID_KEY = 'orbitSyncProjectId';
// A per-device (not per-pairing) preference - deliberately survives
// clearSyncPairing/setSyncPairing, since it's about *this device's own*
// taste in colors, not something tied to any one pairing code.
const KEEP_LOCAL_STYLE_KEY = 'orbitSyncKeepLocalStyle';
const MANAGER_ROLE = 'manager';
const VIEWER_ROLE = 'viewer';
// 0/O/1/I excluded so a hand-copied or read-aloud code is never ambiguous.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

function readLocal(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function writeLocal(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable (private browsing, etc.) */
  }
}

function isSyncProxyConfigured() {
  return !!SYNC_PROXY_URL;
}
function getSyncCode() {
  return readLocal(CODE_KEY).trim();
}
function isSyncConfigured() {
  return !!getSyncCode();
}
// Devices that created or explicitly joined-as-manager a sync can edit and
// publish changes; every other paired device defaults to (and can only
// become) a viewer - it receives updates but is locked out of editing (see
// isSyncViewer's callers: syncTick never pushes for one, and the editor UI
// locks itself down - src/editor-core.js's applyEditorRoleLock). A device
// paired before this feature existed has no role recorded yet; treating that
// as 'manager' preserves its previous (both-can-edit) behavior rather than
// retroactively locking someone out.
function getSyncRole() {
  return readLocal(ROLE_KEY).trim() === VIEWER_ROLE ? VIEWER_ROLE : MANAGER_ROLE;
}
function isSyncViewer() {
  return isSyncConfigured() && getSyncRole() === VIEWER_ROLE;
}
// A receiving device's own opt-out of the shared color scheme - once set,
// pullSyncSnapshot (see below) keeps this device's own proAccent/
// proSecondary/proTertiary/styleSlots untouched no matter what a manager
// device publishes, while still applying every other synced change
// normally. Most useful for a viewer (who never publishes style changes of
// their own anyway), but not restricted to one - nothing about wanting your
// own device's colors left alone requires being read-only.
function getSyncKeepLocalStyle() {
  return readLocal(KEEP_LOCAL_STYLE_KEY) === '1';
}
function setSyncKeepLocalStyle(value) {
  writeLocal(KEEP_LOCAL_STYLE_KEY, value ? '1' : '');
}
function generateSyncCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}
function setSyncPairing(code, role = MANAGER_ROLE) {
  writeLocal(
    CODE_KEY,
    String(code || '')
      .trim()
      .toUpperCase()
  );
  writeLocal(ROLE_KEY, role === VIEWER_ROLE ? VIEWER_ROLE : MANAGER_ROLE);
  writeLocal(LAST_UPDATE_TIME_KEY, '');
  writeLocal(LEGACY_PROJECT_ID_KEY, '');
  lastPushedSnapshot = null;
}
function clearSyncPairing() {
  writeLocal(CODE_KEY, '');
  writeLocal(ROLE_KEY, '');
  writeLocal(LAST_UPDATE_TIME_KEY, '');
  writeLocal(LEGACY_PROJECT_ID_KEY, '');
  lastPushedSnapshot = null;
}
function proxyUrl(code) {
  return `${SYNC_PROXY_URL}?code=${encodeURIComponent(code)}`;
}
// The proxy's errors (rate limit, bad code, upstream failure) come back as
// `{error:{message}}` - a 429 gets its own friendlier text here rather than
// whatever the Worker's own (already-friendly, but sync-context-less)
// message says.
async function proxyErrorMessage(response) {
  if (response.status === 429) return '請求過於頻繁，請稍後再試。';
  const errorJson = await response.json().catch(() => ({}));
  return errorJson.error?.message || response.statusText || `HTTP ${response.status}`;
}

async function fetchSyncDoc(code) {
  const response = await fetch(proxyUrl(code));
  // The Worker rejects a code that doesn't match the expected 8-character
  // shape with 400, before it ever asks Firestore about it - a real,
  // generated code always matches that shape, so from here a 400 only ever
  // means a mistyped/bogus code, never a genuine failure. Treated the same
  // as "not found" (a real code that just has nothing published under it
  // yet) so the user sees the same friendly "找不到這組配對代碼" either way,
  // instead of a raw "Invalid pairing code".
  if (response.status === 400) return { ok: true, exists: false, updateTime: '', payload: '' };
  if (!response.ok) return { ok: false, error: await proxyErrorMessage(response) };
  const data = await response.json();
  return {
    ok: true,
    exists: !!data.exists,
    updateTime: data.updateTime || '',
    payload: data.payload || ''
  };
}

async function writeSyncDoc(code, payload) {
  const response = await fetch(proxyUrl(code), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload })
  });
  if (!response.ok) return { ok: false, error: await proxyErrorMessage(response) };
  const doc = await response.json();
  return { ok: true, updateTime: doc.updateTime || '' };
}

// Uploads the currently-saved schedule as-is (never the live, possibly
// unsaved editor form) so sync can never publish a half-edited draft.
async function pushSyncSnapshot() {
  const code = getSyncCode();
  if (!isSyncProxyConfigured() || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const payload = await encodeTransferData(state.applicationData);
    const result = await writeSyncDoc(code, payload);
    if (!result.ok) throw new Error(result.error);
    writeLocal(LAST_UPDATE_TIME_KEY, result.updateTime);
    // Owned here, not by callers - applyEditorSettingsData's own
    // immediate-push-on-save (see editor-backup.js) and syncTick's regular
    // poll both funnel through this one function, so this is the one place
    // that reliably knows "what we last actually pushed matches what's live
    // right now" regardless of which caller triggered it.
    lastPushedSnapshot = JSON.stringify(state.applicationData);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `同步上傳失敗：${error.message || error}` };
  }
}

// Pulls the shared document and applies it only when it's actually newer
// than the last version this device already has, and only when the editor
// has no unsaved changes in progress (never clobber an in-progress edit).
// `exists` distinguishes "not found, nothing was ever published under this
// code" from every other outcome (found the document, whether or not there
// was anything new to apply) - performSyncJoin() needs that distinction to
// refuse joining a code nobody has actually created yet, which callers
// that only care about `applied` (syncTick's regular polling) can ignore.
async function pullSyncSnapshot({ force = false } = {}) {
  const code = getSyncCode();
  if (!isSyncProxyConfigured() || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const doc = await fetchSyncDoc(code);
    if (!doc.ok) throw new Error(doc.error);
    if (!doc.exists) return { ok: true, applied: false, exists: false };
    if (!doc.payload) return { ok: true, applied: false, exists: true };
    if (!force && doc.updateTime && doc.updateTime === readLocal(LAST_UPDATE_TIME_KEY)) {
      return { ok: true, applied: false, exists: true };
    }
    if (isEditorDirty()) return { ok: true, applied: false, exists: true };
    const next = normalizeSettingsData(await decodeTransferData(doc.payload), {
      requireMarker: true
    });
    if (getSyncKeepLocalStyle()) {
      next.proAccent = state.applicationData.proAccent;
      next.proSecondary = state.applicationData.proSecondary;
      next.proTertiary = state.applicationData.proTertiary;
      next.styleSlots = state.applicationData.styleSlots;
    }
    if (JSON.stringify(next) === JSON.stringify(state.applicationData)) {
      writeLocal(LAST_UPDATE_TIME_KEY, doc.updateTime);
      return { ok: true, applied: false, exists: true };
    }
    applyEditorSettingsData(next, { statusMessage: '已從其他裝置同步課表。', fromSync: true });
    writeLocal(LAST_UPDATE_TIME_KEY, doc.updateTime);
    lastPushedSnapshot = JSON.stringify(state.applicationData);
    return { ok: true, applied: true, exists: true };
  } catch (error) {
    return { ok: false, error: `同步下載失敗：${error.message || error}` };
  }
}

let lastPushedSnapshot = null;
let syncInFlight = false;

function setSyncStatusUi(message, isError) {
  const status = document.getElementById('sync-status');
  if (!status) return;
  status.textContent = message || '';
  status.style.color = isError ? '#ff6b6b' : 'var(--sub)';
}

// One check does at most one round trip: push when this device changed
// since its last push, otherwise pull to pick up any change from
// elsewhere. Never both in the same tick - there's nothing to reconcile
// since a push always means "we are already current" and a pull that
// changes anything updates lastPushedSnapshot itself.
//
// A viewer never pushes, full stop - not even as a fallback if a local
// mutation somehow slipped past the editor's UI lock (see
// src/editor-core.js's applyEditorRoleLock). It only ever pulls, so it stays
// a pure mirror of whatever a manager device published.
async function syncTick() {
  if (!isSyncConfigured() || document.hidden || syncInFlight) return false;
  syncInFlight = true;
  try {
    if (isEditorDirty()) return false;
    if (isSyncViewer()) {
      const result = await pullSyncSnapshot();
      if (!result.ok) setSyncStatusUi(result.error, true);
      return !!result.applied;
    }
    const currentSnapshot = JSON.stringify(state.applicationData);
    if (currentSnapshot !== lastPushedSnapshot) {
      const result = await pushSyncSnapshot();
      if (!result.ok) setSyncStatusUi(result.error, true);
      return result.ok;
    }
    const result = await pullSyncSnapshot();
    if (!result.ok) setSyncStatusUi(result.error, true);
    return !!result.applied;
  } finally {
    syncInFlight = false;
  }
}

// No background timer at all - a device nobody is touching has no reason to
// keep asking whether something changed. Instead, an actual interaction
// with the page triggers a check, throttled to at most once per
// ACTIVITY_SYNC_THROTTLE_MS so a burst of clicks or typing collapses into
// one check instead of one per event. The result: genuinely zero network
// requests while the app just sits open and idle, at the cost of a receiving
// device that's left completely untouched only picking up a change the
// next time someone actually interacts with it (or reopens/refocuses the
// tab - see syncOnAppActive below, which isn't subject to this throttle).
// A real local save is unaffected by any of this either way - it pushes
// immediately regardless (see editor-backup.js's applyEditorSettingsData).
const ACTIVITY_SYNC_THROTTLE_MS = 5000;
const ACTIVITY_EVENT_TYPES = ['click', 'pointerdown', 'keydown', 'touchstart'];
let lastActivitySyncAt = 0;
function onUserActivity() {
  const now = Date.now();
  if (now - lastActivitySyncAt < ACTIVITY_SYNC_THROTTLE_MS) return;
  lastActivitySyncAt = now;
  syncTick();
}
// The moment the app becomes active - first load, a reload, or the tab
// regaining focus after being backgrounded/suspended - always checks,
// bypassing the throttle above: that's exactly when stale data is most
// likely and least forgivable, not something to suppress just because some
// unrelated click happened a couple of seconds earlier. Also resets the
// throttle window so a click immediately afterward doesn't fire a second,
// redundant check.
function syncOnAppActive() {
  lastActivitySyncAt = Date.now();
  syncTick();
}
let syncLoopStarted = false;
function startSyncLoop() {
  if (syncLoopStarted) return;
  syncLoopStarted = true;
  lastPushedSnapshot = JSON.stringify(state.applicationData);
  syncOnAppActive();
  ACTIVITY_EVENT_TYPES.forEach(type =>
    document.addEventListener(type, onUserActivity, { passive: true })
  );
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncOnAppActive();
});
window.addEventListener('pageshow', syncOnAppActive);

function renderSyncPanel() {
  const setupBox = document.getElementById('sync-setup-box');
  const activeBox = document.getElementById('sync-active-box');
  const activeCode = document.getElementById('sync-active-code');
  const roleLabel = document.getElementById('sync-role-label');
  const keepStyleCheckbox = document.getElementById('sync-keep-local-style');
  if (!setupBox || !activeBox) return;
  const configured = isSyncConfigured();
  setupBox.hidden = configured;
  activeBox.hidden = !configured;
  if (configured && activeCode) activeCode.textContent = getSyncCode();
  if (configured && roleLabel) {
    const viewer = isSyncViewer();
    roleLabel.textContent = viewer
      ? '身份：僅接收（唯讀）— 課表會自動更新，但這台裝置無法編輯。'
      : '身份：管理者 — 可以編輯課表，變更會同步到其他裝置。';
    roleLabel.classList.toggle('is-viewer', viewer);
  }
  if (keepStyleCheckbox) keepStyleCheckbox.checked = getSyncKeepLocalStyle();
  applyEditorRoleLock();
}
function orbitSyncSetKeepLocalStyle(checked) {
  setSyncKeepLocalStyle(!!checked);
  // The style tool's own lock (see applyEditorRoleLock) depends on this
  // setting too, not just role - refresh it immediately so ticking the box
  // unlocks the style button right away, no reload or re-pair needed.
  applyEditorRoleLock();
}

// Locks the rest of the editor down to view-only for a viewer device -
// everything except the always-visible "同步 / 匯入匯出" panel itself (where
// the unlink button that gets a viewer back to full local editing lives).
// This is a UX guardrail, not a real access-control boundary - same as the
// rest of sync's design (see README's security section) - so it's plain
// CSS (.sync-viewer-locked, see styles.css) rather than anything that
// actually removes the underlying form controls.
function applyEditorRoleLock() {
  const sheet = document.getElementById('editor-sheet');
  if (sheet) sheet.classList.toggle('sync-viewer-locked', isSyncViewer());
  // The style tool is a separate top-bar overlay, not part of #editor-sheet
  // at all, so it needs its own lock: a viewer who's still accepting synced
  // colors (hasn't checked "不同步樣式顏色") has no real use for it - any
  // local color change it made would just get overwritten by the next
  // pulled update anyway, which is confusing busywork, not a real feature.
  // A viewer who *has* opted out is exempt - that's the whole point of the
  // opt-out - and a manager is never locked out of it at all, since setting
  // the shared style in the first place is the manager's job.
  const styleButton = document.getElementById('btn-style');
  if (styleButton) {
    const locked = isSyncViewer() && !getSyncKeepLocalStyle();
    styleButton.classList.toggle('is-disabled', locked);
    styleButton.title = locked
      ? '此裝置正在同步樣式，無法自行變更。若要自訂樣式，請先在同步面板勾選「不同步樣式顏色」。'
      : '樣式工具';
  }
}

// ---- UI entry points, exposed on window for index.html's onclick="..." ----

// Greys the triggering button out for the duration of its own async work, so
// a slow connection can't be double-clicked into firing the same
// create/join request twice. Re-enables in `finally` regardless of which
// branch the wrapped work took (success, a friendly rejection, or an error).
async function withButtonDisabled(buttonId, fn) {
  const button = document.getElementById(buttonId);
  if (button) button.disabled = true;
  try {
    await fn();
  } finally {
    if (button) button.disabled = false;
  }
}

async function orbitSyncCreate() {
  if (!isSyncProxyConfigured()) {
    setSyncStatusUi('跨裝置同步功能尚未設定，請聯絡課表管理者。', true);
    return;
  }
  await withButtonDisabled('sync-create-btn', async () => {
    setSyncPairing(generateSyncCode());
    setSyncStatusUi('正在建立同步…');
    const result = await pushSyncSnapshot();
    if (!result.ok) {
      clearSyncPairing();
      setSyncStatusUi(result.error, true);
      return;
    }
    renderSyncPanel();
    setSyncStatusUi('同步已建立，可在另一台裝置輸入代碼加入。');
    startSyncLoop();
  });
}
// A lightweight existence check, deliberately not going through
// setSyncPairing/pullSyncSnapshot - those read the *currently paired* code
// from localStorage, but orbitSyncJoin needs to check a code before
// committing to anything (or showing a warning that only makes sense if the
// code actually has data to overwrite with).
async function checkSyncCodeExists(code) {
  try {
    const doc = await fetchSyncDoc(code);
    if (!doc.ok) return { ok: false, error: `同步檢查失敗：${doc.error}` };
    return { ok: true, exists: doc.exists };
  } catch (error) {
    return { ok: false, error: `同步檢查失敗：${error.message || error}` };
  }
}

async function orbitSyncJoin() {
  if (!isSyncProxyConfigured()) {
    setSyncStatusUi('跨裝置同步功能尚未設定，請聯絡課表管理者。', true);
    return;
  }
  const code = document.getElementById('sync-join-code')?.value.trim();
  if (!code) {
    setSyncStatusUi('請輸入配對代碼。', true);
    return;
  }
  // Joining defaults to view-only (the whole point of a manager/viewer
  // split: most joining devices should just receive updates) - checking
  // "以管理者身份加入" is how a second editable device gets added on
  // purpose, matching "one or more devices as manager" rather than "exactly
  // one".
  const asManager = !!document.getElementById('sync-join-as-manager')?.checked;
  const normalizedCode = code.toUpperCase();

  await withButtonDisabled('sync-join-btn', async () => {
    // Check the code actually has something to join *before* ever showing
    // the overwrite warning below - a nonexistent/mistyped code has nothing
    // to overwrite with, so warning about data loss and then failing anyway
    // (the bug performSyncJoin's own `exists` check already prevents) was
    // just a confusing, pointless extra step. Fail fast with the real error
    // instead.
    setSyncStatusUi('正在檢查配對代碼…');
    const check = await checkSyncCodeExists(normalizedCode);
    if (!check.ok) {
      setSyncStatusUi(check.error, true);
      return;
    }
    if (!check.exists) {
      setSyncStatusUi('找不到這組配對代碼，請確認代碼是否正確，或請對方先按「建立新同步」。', true);
      return;
    }

    // Joining pulls whatever is already published under that code and
    // applies it immediately - overwriting this device's current schedule -
    // so this warns before doing anything, rather than silently replacing
    // data the user might not have backed up.
    setSyncStatusUi('');
    setEditorConfirmContent(
      '加入同步？',
      '這組代碼下已經有課表，加入後會立刻用該課表取代這台裝置目前的課表，且無法復原。建立同步的裝置目前的課表不會受影響。',
      '',
      '仍要加入',
      () => {
        hideEditorDiscardConfirm();
        performSyncJoin(normalizedCode, asManager);
      },
      '取消'
    );
    showEditorConfirmSheet();
  });
}

async function performSyncJoin(code, asManager) {
  setSyncPairing(code, asManager ? MANAGER_ROLE : VIEWER_ROLE);
  setSyncStatusUi('正在加入同步…');
  const result = await pullSyncSnapshot({ force: true });
  if (!result.ok) {
    clearSyncPairing();
    setSyncStatusUi(result.error, true);
    return;
  }
  // "加入同步" only ever joins a sync someone already created (with
  // "建立新同步", which auto-generates its own code and immediately
  // publishes) - "not found" here means this code was mistyped or never
  // created, not "an empty sync to adopt." Bug this used to have: this case
  // reported success and paired the device anyway (worse for a viewer, who'd
  // then just sit there forever receiving nothing, thinking it was synced).
  // Refusing outright, for both roles, also removes the old "join as
  // manager silently creates/publishes under whatever code you typed"
  // fallback - that's what "建立新同步" is for.
  if (!result.exists) {
    clearSyncPairing();
    setSyncStatusUi('找不到這組配對代碼，請確認代碼是否正確，或請對方先按「建立新同步」。', true);
    return;
  }
  renderSyncPanel();
  setSyncStatusUi(asManager ? '已以管理者身份加入同步。' : '已加入同步（僅接收）。');
  startSyncLoop();
}
// Unlinking discards the only copy of the pairing code this device has -
// there's no "undo", and no way to look the code back up afterward except
// asking another already-paired device - so this warns first and offers a
// one-tap copy of the code before committing, rather than silently
// discarding something that might be needed again to rejoin.
function orbitSyncUnlink() {
  const code = getSyncCode();
  setEditorConfirmContent(
    '解除同步？',
    '解除後這台裝置會變回本機課表，不再自動接收其他裝置的更新。之後如果想重新加入，需要用回這組配對代碼——建議先複製起來備用：',
    code,
    '解除同步',
    () => {
      hideEditorDiscardConfirm();
      clearSyncPairing();
      renderSyncPanel();
      setSyncStatusUi('已解除同步（不影響本機課表）。');
    },
    '取消',
    {
      extraLabel: '複製代碼',
      // Deliberately doesn't close the sheet (unlike the default
      // extraHandler) - copying is meant to happen *before* deciding
      // whether to actually confirm the unlink, not instead of it.
      extraHandler: async () => {
        const extraBtn = document.getElementById('editor-confirm-extra-btn');
        try {
          await copyTransferText(code);
          if (extraBtn) extraBtn.textContent = '已複製！';
        } catch (error) {
          setSyncStatusUi(`複製失敗：${error.message || error}`, true);
        }
      }
    }
  );
  showEditorConfirmSheet();
}

window.orbitSyncCreate = orbitSyncCreate;
window.orbitSyncJoin = orbitSyncJoin;
window.orbitSyncUnlink = orbitSyncUnlink;
window.orbitSyncSetKeepLocalStyle = orbitSyncSetKeepLocalStyle;

export {
  applyEditorRoleLock,
  clearSyncPairing,
  generateSyncCode,
  getSyncCode,
  getSyncKeepLocalStyle,
  getSyncRole,
  isSyncConfigured,
  isSyncProxyConfigured,
  isSyncViewer,
  orbitSyncCreate,
  orbitSyncJoin,
  orbitSyncSetKeepLocalStyle,
  orbitSyncUnlink,
  performSyncJoin,
  pullSyncSnapshot,
  pushSyncSnapshot,
  renderSyncPanel,
  setSyncKeepLocalStyle,
  setSyncPairing,
  setSyncStatusUi,
  startSyncLoop,
  syncTick
};
