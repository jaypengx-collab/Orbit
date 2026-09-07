// ---- src/sync.js ----
// Optional cross-device sync: mirrors the already-saved schedule
// (state.applicationData) to a Firestore document and polls it for changes
// made from other devices. Reuses the same compressed v2 backup string the
// manual export/import flow already produces (editor-backup.js) as the
// document payload, so this is really "auto-paste the export text into a
// shared doc, auto-import it elsewhere" rather than a separate data format.
//
// No server of Orbit's own: sync talks to a single shared Firebase project
// (its ID baked in at build time via VITE_ORBIT_SYNC_PROJECT_ID - see
// README) that the app's owner - not each user - creates once, so a device
// only ever needs a pairing code. Firestore's REST API is called directly
// with fetch (no SDK, no new dependency) - the same way gemini-ocr.js talks
// to Gemini's REST API without a client library. A pairing code is just the
// Firestore document ID every paired device reads/writes; nothing here
// proves who the caller is, so whatever Firestore security rule is set on
// /orbit-schedules/{code} is the only access control - see README for the
// exact rule text this is designed against. A build without that env var
// set (e.g. a fork run from source) falls back to letting each device type
// in its own Firebase project ID, exactly like before.
import { state } from './state.js';
import {
  applyEditorSettingsData,
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

const DEFAULT_PROJECT_ID = (import.meta.env.VITE_ORBIT_SYNC_PROJECT_ID || '').trim();
const PROJECT_ID_KEY = 'orbitSyncProjectId';
const CODE_KEY = 'orbitSyncCode';
const ROLE_KEY = 'orbitSyncRole';
const LAST_UPDATE_TIME_KEY = 'orbitSyncLastUpdateTime';
const POLL_INTERVAL_MS = 8000;
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

function hasDefaultSyncProjectId() {
  return !!DEFAULT_PROJECT_ID;
}
function getSyncProjectId() {
  return readLocal(PROJECT_ID_KEY).trim() || DEFAULT_PROJECT_ID;
}
function getSyncCode() {
  return readLocal(CODE_KEY).trim();
}
function isSyncConfigured() {
  return !!(getSyncProjectId() && getSyncCode());
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
function generateSyncCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}
function setSyncPairing(projectId, code, role = MANAGER_ROLE) {
  writeLocal(PROJECT_ID_KEY, String(projectId || '').trim());
  writeLocal(
    CODE_KEY,
    String(code || '')
      .trim()
      .toUpperCase()
  );
  writeLocal(ROLE_KEY, role === VIEWER_ROLE ? VIEWER_ROLE : MANAGER_ROLE);
  writeLocal(LAST_UPDATE_TIME_KEY, '');
  lastPushedSnapshot = null;
}
function clearSyncPairing() {
  writeLocal(PROJECT_ID_KEY, '');
  writeLocal(CODE_KEY, '');
  writeLocal(ROLE_KEY, '');
  writeLocal(LAST_UPDATE_TIME_KEY, '');
  lastPushedSnapshot = null;
}
function docUrl(projectId, code) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/orbit-schedules/${encodeURIComponent(code)}`;
}
async function firestoreErrorMessage(response) {
  const errorJson = await response.json().catch(() => ({}));
  return errorJson.error?.message || response.statusText || `HTTP ${response.status}`;
}

// Uploads the currently-saved schedule as-is (never the live, possibly
// unsaved editor form) so sync can never publish a half-edited draft.
async function pushSyncSnapshot() {
  const projectId = getSyncProjectId();
  const code = getSyncCode();
  if (!projectId || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const payload = await encodeTransferData(state.applicationData);
    const response = await fetch(`${docUrl(projectId, code)}?updateMask.fieldPaths=payload`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { payload: { stringValue: payload } } })
    });
    if (!response.ok) throw new Error(await firestoreErrorMessage(response));
    const doc = await response.json();
    writeLocal(LAST_UPDATE_TIME_KEY, doc.updateTime || '');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `同步上傳失敗：${error.message || error}` };
  }
}

// Pulls the shared document and applies it only when it's actually newer
// than the last version this device already has, and only when the editor
// has no unsaved changes in progress (never clobber an in-progress edit).
// `exists` distinguishes "404, nothing was ever published under this code"
// from every other outcome (found the document, whether or not there was
// anything new to apply) - performSyncJoin() needs that distinction to
// refuse joining a code nobody has actually created yet, which callers
// that only care about `applied` (syncTick's regular polling) can ignore.
async function pullSyncSnapshot({ force = false } = {}) {
  const projectId = getSyncProjectId();
  const code = getSyncCode();
  if (!projectId || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const response = await fetch(docUrl(projectId, code));
    if (response.status === 404) return { ok: true, applied: false, exists: false };
    if (!response.ok) throw new Error(await firestoreErrorMessage(response));
    const doc = await response.json();
    const remoteUpdateTime = doc.updateTime || '';
    const payload = doc.fields?.payload?.stringValue || '';
    if (!payload) return { ok: true, applied: false, exists: true };
    if (!force && remoteUpdateTime && remoteUpdateTime === readLocal(LAST_UPDATE_TIME_KEY)) {
      return { ok: true, applied: false, exists: true };
    }
    if (isEditorDirty()) return { ok: true, applied: false, exists: true };
    const next = normalizeSettingsData(await decodeTransferData(payload), { requireMarker: true });
    if (JSON.stringify(next) === JSON.stringify(state.applicationData)) {
      writeLocal(LAST_UPDATE_TIME_KEY, remoteUpdateTime);
      return { ok: true, applied: false, exists: true };
    }
    applyEditorSettingsData(next, { statusMessage: '已從其他裝置同步課表。' });
    writeLocal(LAST_UPDATE_TIME_KEY, remoteUpdateTime);
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

// One poll does at most one round trip: push when this device changed since
// its last push, otherwise pull to pick up any change from elsewhere. Never
// both in the same tick - there's nothing to reconcile since a push always
// means "we are already current" and a pull that changes anything updates
// lastPushedSnapshot itself.
//
// A viewer never pushes, full stop - not even as a fallback if a local
// mutation somehow slipped past the editor's UI lock (see
// src/editor-core.js's applyEditorRoleLock). It only ever pulls, so it stays
// a pure mirror of whatever a manager device published.
async function syncTick() {
  if (!isSyncConfigured() || document.hidden || syncInFlight) return;
  syncInFlight = true;
  try {
    if (isEditorDirty()) return;
    if (isSyncViewer()) {
      const result = await pullSyncSnapshot();
      if (!result.ok) setSyncStatusUi(result.error, true);
      return;
    }
    const currentSnapshot = JSON.stringify(state.applicationData);
    if (currentSnapshot !== lastPushedSnapshot) {
      const result = await pushSyncSnapshot();
      if (result.ok) lastPushedSnapshot = currentSnapshot;
      else setSyncStatusUi(result.error, true);
      return;
    }
    const result = await pullSyncSnapshot();
    if (!result.ok) setSyncStatusUi(result.error, true);
  } finally {
    syncInFlight = false;
  }
}

let syncTimer = null;
function startSyncLoop() {
  if (syncTimer) return;
  lastPushedSnapshot = JSON.stringify(state.applicationData);
  syncTick();
  syncTimer = setInterval(syncTick, POLL_INTERVAL_MS);
}

function renderSyncPanel() {
  const setupBox = document.getElementById('sync-setup-box');
  const activeBox = document.getElementById('sync-active-box');
  const activeCode = document.getElementById('sync-active-code');
  const roleLabel = document.getElementById('sync-role-label');
  const projectIdField = document.getElementById('sync-project-id');
  const setupHint = document.getElementById('sync-setup-hint');
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
  if (projectIdField) projectIdField.hidden = hasDefaultSyncProjectId();
  if (setupHint)
    setupHint.textContent = hasDefaultSyncProjectId()
      ? '同步會把課表存到 Orbit AI 內建的同步伺服器，讓多台裝置自動保持一致，不需要自己申請任何帳號。'
      : '同步會把課表存到你自己的 Firebase 專案（Firestore），讓多台裝置自動保持一致。需要一個免費的 Firebase 專案。';
  applyEditorRoleLock();
}

// Locks the rest of the editor down to view-only for a viewer device -
// everything except the always-visible "同步 / 匯入匯出" panel itself (where
// the unlink button that gets a viewer back to full local editing lives).
// This is a UX guardrail, not a real access-control boundary - same as the
// rest of sync's fully-open Firestore rules (see README) - so it's plain
// CSS (.sync-viewer-locked, see styles.css) rather than anything that
// actually removes the underlying form controls.
function applyEditorRoleLock() {
  const sheet = document.getElementById('editor-sheet');
  if (sheet) sheet.classList.toggle('sync-viewer-locked', isSyncViewer());
}

// ---- UI entry points, exposed on window for index.html's onclick="..." ----
async function orbitSyncCreate() {
  const projectId = DEFAULT_PROJECT_ID || document.getElementById('sync-project-id')?.value.trim();
  if (!projectId) {
    setSyncStatusUi('請先輸入 Firebase 專案 ID。', true);
    return;
  }
  setSyncPairing(projectId, generateSyncCode());
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
}
// A lightweight existence check, deliberately not going through
// setSyncPairing/pullSyncSnapshot - those read the *currently paired*
// project/code from localStorage, but orbitSyncJoin needs to check a code
// before committing to anything (or showing a warning that only makes
// sense if the code actually has data to overwrite with).
async function checkSyncCodeExists(projectId, code) {
  try {
    const response = await fetch(docUrl(projectId, code));
    if (response.status === 404) return { ok: true, exists: false };
    if (!response.ok)
      return { ok: false, error: `同步檢查失敗：${await firestoreErrorMessage(response)}` };
    return { ok: true, exists: true };
  } catch (error) {
    return { ok: false, error: `同步檢查失敗：${error.message || error}` };
  }
}

async function orbitSyncJoin() {
  const projectId = DEFAULT_PROJECT_ID || document.getElementById('sync-project-id')?.value.trim();
  const code = document.getElementById('sync-join-code')?.value.trim();
  if (!projectId) {
    setSyncStatusUi('請先輸入 Firebase 專案 ID。', true);
    return;
  }
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

  // Check the code actually has something to join *before* ever showing
  // the overwrite warning below - a nonexistent/mistyped code has nothing
  // to overwrite with, so warning about data loss and then failing anyway
  // (the bug performSyncJoin's own `exists` check already prevents) was
  // just a confusing, pointless extra step. Fail fast with the real error
  // instead.
  setSyncStatusUi('正在檢查配對代碼…');
  const check = await checkSyncCodeExists(projectId, normalizedCode);
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
      performSyncJoin(projectId, normalizedCode, asManager);
    },
    '取消'
  );
  showEditorConfirmSheet();
}

async function performSyncJoin(projectId, code, asManager) {
  setSyncPairing(projectId, code, asManager ? MANAGER_ROLE : VIEWER_ROLE);
  setSyncStatusUi('正在加入同步…');
  const result = await pullSyncSnapshot({ force: true });
  if (!result.ok) {
    clearSyncPairing();
    setSyncStatusUi(result.error, true);
    return;
  }
  // "加入同步" only ever joins a sync someone already created (with
  // "建立新同步", which auto-generates its own code and immediately
  // publishes) - a 404 here means this code was mistyped or never created,
  // not "an empty sync to adopt." Bug this used to have: this case reported
  // success and paired the device anyway (worse for a viewer, who'd then
  // just sit there forever receiving nothing, thinking it was synced).
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
function orbitSyncUnlink() {
  clearSyncPairing();
  renderSyncPanel();
  setSyncStatusUi('已解除同步（不影響本機課表）。');
}

window.orbitSyncCreate = orbitSyncCreate;
window.orbitSyncJoin = orbitSyncJoin;
window.orbitSyncUnlink = orbitSyncUnlink;

export {
  applyEditorRoleLock,
  clearSyncPairing,
  generateSyncCode,
  getSyncCode,
  getSyncProjectId,
  getSyncRole,
  hasDefaultSyncProjectId,
  isSyncConfigured,
  isSyncViewer,
  orbitSyncCreate,
  orbitSyncJoin,
  orbitSyncUnlink,
  performSyncJoin,
  pullSyncSnapshot,
  pushSyncSnapshot,
  renderSyncPanel,
  setSyncPairing,
  setSyncStatusUi,
  startSyncLoop,
  syncTick
};
