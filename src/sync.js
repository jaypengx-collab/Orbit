// ---- src/sync.js ----
// Optional cross-device sync: mirrors the already-saved schedule
// (state.applicationData) to a Firestore document and polls it for changes
// made from other devices. Reuses the same compressed v2 backup string the
// manual export/import flow already produces (editor-backup.js) as the
// document payload, so this is really "auto-paste the export text into a
// shared doc, auto-import it elsewhere" rather than a separate data format.
//
// No server of Orbit's own, in the sense that end users never run or pay
// for anything: sync talks to a single shared Firebase project that the
// app's owner - not each user - creates once, so a device only ever needs a
// pairing code.
//
// Two ways this can reach Firestore, chosen at build time:
//   - VITE_ORBIT_SYNC_PROXY_URL set: every read/write goes through a
//     Cloudflare Worker (see cloudflare-worker/sync-proxy-worker.js) that
//     holds its own Firebase service-account credentials server-side and
//     applies real, cross-request rate limiting - the same reasoning as
//     gemini-ocr.js talking to the Gemini proxy instead of Gemini directly.
//     This is the recommended, hardened path for a publicly-deployed
//     instance.
//   - Otherwise, VITE_ORBIT_SYNC_PROJECT_ID set (or typed in by the user for
//     a fork with neither set): Firestore's REST API is called directly
//     with fetch (no SDK, no new dependency). A pairing code is just the
//     Firestore document ID every paired device reads/writes; nothing here
//     proves who the caller is, so whatever Firestore security rule is set
//     on /orbit-schedules/{code} is the only access control - see README
//     for the exact rule text this is designed against, including the
//     `if false` variant meant to be paired with the proxy above.
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
const SYNC_PROXY_URL = (import.meta.env.VITE_ORBIT_SYNC_PROXY_URL || '').trim();
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
// When set, every read/write goes through cloudflare-worker/sync-proxy-
// worker.js instead of straight to Firestore - see the top-of-file comment.
// The proxy holds its own Firebase project ID server-side, so unlike the
// direct-Firestore path, a proxied build needs no project ID from the
// client at all.
function hasSyncProxy() {
  return !!SYNC_PROXY_URL;
}
// True for any build where the app's owner has already set up a shared
// backend (either path) - used purely for UI decisions like hiding the
// manual "Firebase 專案 ID" field, which only ever makes sense for a fork
// running with neither configured.
function isManagedSyncDeployment() {
  return hasSyncProxy() || hasDefaultSyncProjectId();
}
function getSyncProjectId() {
  return readLocal(PROJECT_ID_KEY).trim() || DEFAULT_PROJECT_ID;
}
function getSyncCode() {
  return readLocal(CODE_KEY).trim();
}
function isSyncConfigured() {
  return !!((hasSyncProxy() || getSyncProjectId()) && getSyncCode());
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
function proxyUrl(code) {
  return `${SYNC_PROXY_URL}?code=${encodeURIComponent(code)}`;
}
async function firestoreErrorMessage(response) {
  const errorJson = await response.json().catch(() => ({}));
  return errorJson.error?.message || response.statusText || `HTTP ${response.status}`;
}
// The proxy's own errors (rate limit, bad code, upstream failure) come back
// as the same `{error:{message}}` shape as gemini-proxy-worker.js, but a 429
// gets its own friendlier text here rather than whatever the Worker's own
// (already-friendly, but sync-context-less) message says.
async function proxyErrorMessage(response) {
  if (response.status === 429) return '請求過於頻繁，請稍後再試。';
  return firestoreErrorMessage(response);
}

// A GET Firestore rejects with 403 for a code that doesn't match the
// expected shape (see README's recommended rule: `allow get: if
// code.matches(...)`) - that check runs before Firestore ever looks for a
// document, so from the app's perspective it's indistinguishable from "not
// found": a real, generated code always matches that shape, so a 403 here
// only ever means a mistyped/bogus code, never a genuine permissions
// problem with an otherwise-valid one. Treated the same as 404 everywhere
// "does this code exist" is asked, so the user sees "找不到這組配對代碼"
// instead of a raw, confusing "Missing or insufficient permissions".
function isCodeNotFoundStatus(status) {
  return status === 404 || status === 403;
}

// Normalizes the two possible read paths - the proxy Worker or direct
// Firestore - into one shape, so every caller below can stay agnostic about
// which one is active. `projectId` is ignored entirely when the proxy is
// configured (it never leaves the client in that mode - see hasSyncProxy).
async function fetchSyncDoc(projectId, code) {
  if (hasSyncProxy()) {
    const response = await fetch(proxyUrl(code));
    if (!response.ok) return { ok: false, error: await proxyErrorMessage(response) };
    const data = await response.json();
    return {
      ok: true,
      exists: !!data.exists,
      updateTime: data.updateTime || '',
      payload: data.payload || ''
    };
  }
  const response = await fetch(docUrl(projectId, code));
  if (isCodeNotFoundStatus(response.status)) {
    return { ok: true, exists: false, updateTime: '', payload: '' };
  }
  if (!response.ok) return { ok: false, error: await firestoreErrorMessage(response) };
  const doc = await response.json();
  return {
    ok: true,
    exists: true,
    updateTime: doc.updateTime || '',
    payload: doc.fields?.payload?.stringValue || ''
  };
}

// Same normalization as fetchSyncDoc, for the write side.
async function writeSyncDoc(projectId, code, payload) {
  if (hasSyncProxy()) {
    const response = await fetch(proxyUrl(code), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload })
    });
    if (!response.ok) return { ok: false, error: await proxyErrorMessage(response) };
    const doc = await response.json();
    return { ok: true, updateTime: doc.updateTime || '' };
  }
  const response = await fetch(`${docUrl(projectId, code)}?updateMask.fieldPaths=payload`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { payload: { stringValue: payload } } })
  });
  if (!response.ok) return { ok: false, error: await firestoreErrorMessage(response) };
  const doc = await response.json();
  return { ok: true, updateTime: doc.updateTime || '' };
}

// Uploads the currently-saved schedule as-is (never the live, possibly
// unsaved editor form) so sync can never publish a half-edited draft.
async function pushSyncSnapshot() {
  const projectId = getSyncProjectId();
  const code = getSyncCode();
  if ((!hasSyncProxy() && !projectId) || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const payload = await encodeTransferData(state.applicationData);
    const result = await writeSyncDoc(projectId, code, payload);
    if (!result.ok) throw new Error(result.error);
    writeLocal(LAST_UPDATE_TIME_KEY, result.updateTime);
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
  const projectId = getSyncProjectId();
  const code = getSyncCode();
  if ((!hasSyncProxy() && !projectId) || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const doc = await fetchSyncDoc(projectId, code);
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
    if (JSON.stringify(next) === JSON.stringify(state.applicationData)) {
      writeLocal(LAST_UPDATE_TIME_KEY, doc.updateTime);
      return { ok: true, applied: false, exists: true };
    }
    applyEditorSettingsData(next, { statusMessage: '已從其他裝置同步課表。' });
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
  if (projectIdField) projectIdField.hidden = isManagedSyncDeployment();
  if (setupHint)
    setupHint.textContent = isManagedSyncDeployment()
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
  const projectId = hasSyncProxy()
    ? ''
    : DEFAULT_PROJECT_ID || document.getElementById('sync-project-id')?.value.trim();
  if (!hasSyncProxy() && !projectId) {
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
    const doc = await fetchSyncDoc(projectId, code);
    if (!doc.ok) return { ok: false, error: `同步檢查失敗：${doc.error}` };
    return { ok: true, exists: doc.exists };
  } catch (error) {
    return { ok: false, error: `同步檢查失敗：${error.message || error}` };
  }
}

async function orbitSyncJoin() {
  const projectId = hasSyncProxy()
    ? ''
    : DEFAULT_PROJECT_ID || document.getElementById('sync-project-id')?.value.trim();
  const code = document.getElementById('sync-join-code')?.value.trim();
  if (!hasSyncProxy() && !projectId) {
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
  hasSyncProxy,
  isManagedSyncDeployment,
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
