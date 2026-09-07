// ---- src/sync.js ----
// Optional cross-device sync: mirrors the already-saved schedule
// (state.applicationData) to a Firestore document and polls it for changes
// made from other devices. Reuses the same compressed v2 backup string the
// manual export/import flow already produces (editor-backup.js) as the
// document payload, so this is really "auto-paste the export text into a
// shared doc, auto-import it elsewhere" rather than a separate data format.
//
// No server of Orbit's own: the user supplies their own free Firebase
// project's ID, and Firestore's REST API is called directly with fetch (no
// SDK, no new dependency) - the same way gemini-ocr.js talks to Gemini's
// REST API without a client library. A pairing code is just the Firestore
// document ID both devices read/write; nothing here proves who the caller
// is, so whatever Firestore security rule the user sets on
// /orbit-schedules/{code} is the only access control - see README for the
// exact rule text this is designed against.
import { state } from './state.js';
import {
  applyEditorSettingsData,
  decodeTransferData,
  encodeTransferData,
  isEditorDirty,
  normalizeSettingsData
} from './editor-backup.js';

const PROJECT_ID_KEY = 'orbitSyncProjectId';
const CODE_KEY = 'orbitSyncCode';
const LAST_UPDATE_TIME_KEY = 'orbitSyncLastUpdateTime';
const POLL_INTERVAL_MS = 8000;
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

function getSyncProjectId() {
  return readLocal(PROJECT_ID_KEY).trim();
}
function getSyncCode() {
  return readLocal(CODE_KEY).trim();
}
function isSyncConfigured() {
  return !!(getSyncProjectId() && getSyncCode());
}
function generateSyncCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}
function setSyncPairing(projectId, code) {
  writeLocal(PROJECT_ID_KEY, String(projectId || '').trim());
  writeLocal(
    CODE_KEY,
    String(code || '')
      .trim()
      .toUpperCase()
  );
  writeLocal(LAST_UPDATE_TIME_KEY, '');
  lastPushedSnapshot = null;
}
function clearSyncPairing() {
  writeLocal(PROJECT_ID_KEY, '');
  writeLocal(CODE_KEY, '');
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
async function pullSyncSnapshot({ force = false } = {}) {
  const projectId = getSyncProjectId();
  const code = getSyncCode();
  if (!projectId || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const response = await fetch(docUrl(projectId, code));
    if (response.status === 404) return { ok: true, applied: false };
    if (!response.ok) throw new Error(await firestoreErrorMessage(response));
    const doc = await response.json();
    const remoteUpdateTime = doc.updateTime || '';
    const payload = doc.fields?.payload?.stringValue || '';
    if (!payload) return { ok: true, applied: false };
    if (!force && remoteUpdateTime && remoteUpdateTime === readLocal(LAST_UPDATE_TIME_KEY)) {
      return { ok: true, applied: false };
    }
    if (isEditorDirty()) return { ok: true, applied: false };
    const next = normalizeSettingsData(await decodeTransferData(payload), { requireMarker: true });
    if (JSON.stringify(next) === JSON.stringify(state.applicationData)) {
      writeLocal(LAST_UPDATE_TIME_KEY, remoteUpdateTime);
      return { ok: true, applied: false };
    }
    applyEditorSettingsData(next, { statusMessage: '已從其他裝置同步課表。' });
    writeLocal(LAST_UPDATE_TIME_KEY, remoteUpdateTime);
    lastPushedSnapshot = JSON.stringify(state.applicationData);
    return { ok: true, applied: true };
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
async function syncTick() {
  if (!isSyncConfigured() || document.hidden || syncInFlight) return;
  syncInFlight = true;
  try {
    if (isEditorDirty()) return;
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
  if (!setupBox || !activeBox) return;
  const configured = isSyncConfigured();
  setupBox.hidden = configured;
  activeBox.hidden = !configured;
  if (configured && activeCode) activeCode.textContent = getSyncCode();
}

// ---- UI entry points, exposed on window for index.html's onclick="..." ----
async function orbitSyncCreate() {
  const projectId = document.getElementById('sync-project-id')?.value.trim();
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
async function orbitSyncJoin() {
  const projectId = document.getElementById('sync-project-id')?.value.trim();
  const code = document.getElementById('sync-join-code')?.value.trim();
  if (!projectId || !code) {
    setSyncStatusUi('請輸入 Firebase 專案 ID 與配對代碼。', true);
    return;
  }
  setSyncPairing(projectId, code);
  setSyncStatusUi('正在加入同步…');
  const result = await pullSyncSnapshot({ force: true });
  if (!result.ok) {
    clearSyncPairing();
    setSyncStatusUi(result.error, true);
    return;
  }
  if (!result.applied) {
    // No document yet under this code (or it matched what we already have)
    // - publish this device's data so the code becomes a valid pairing.
    const pushResult = await pushSyncSnapshot();
    if (!pushResult.ok) {
      clearSyncPairing();
      setSyncStatusUi(pushResult.error, true);
      return;
    }
  }
  renderSyncPanel();
  setSyncStatusUi('已加入同步。');
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
  clearSyncPairing,
  generateSyncCode,
  getSyncCode,
  getSyncProjectId,
  isSyncConfigured,
  orbitSyncCreate,
  orbitSyncJoin,
  orbitSyncUnlink,
  pullSyncSnapshot,
  pushSyncSnapshot,
  renderSyncPanel,
  setSyncPairing,
  startSyncLoop,
  syncTick
};
