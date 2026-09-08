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
  cloneSettingsData,
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
// The last style actually seen coming from the shared document - separate
// from this device's own (possibly deliberately different) applicationData
// once KEEP_LOCAL_STYLE_KEY is set. Pairing-scoped, unlike the preference
// above: it's "what this pairing's shared style is", so it's cleared
// alongside the rest of the pairing state.
const LAST_KNOWN_SHARED_STYLE_KEY = 'orbitSyncLastKnownStyle';
// A one-shot safety net for the one genuinely destructive moment in this
// whole feature: un-checking "不同步樣式顏色" immediately pulls the shared
// style in and overwrites whatever this device had, with no other undo. Set
// right before that happens (see orbitSyncSetKeepLocalStyle), cleared once
// the user either restores it or dismisses it - a per-device backup, like
// the preference itself, not tied to any one pairing.
const STYLE_BACKUP_KEY = 'orbitSyncStyleBackup';
// The same kind of one-shot safety net as the style backup above, but for
// the whole schedule: joining an existing sync immediately and irreversibly
// replaces this device's local schedule with whatever the shared document
// holds (see performSyncJoin) - the only warning beforehand is the
// "加入會立刻用該代碼下的課表取代..." text in orbitSyncJoin's confirm sheet,
// which is easy to click through without really registering. Backed up
// right before that replacement actually happens, offered back the moment
// there's somewhere to offer it from again - unlinking or deleting the sync
// both leave this device on its own, which is exactly when "did you want
// your old schedule back, or is the one you've been using fine" becomes a
// real question. Per-device, not tied to any one pairing, same as the style
// backup - a device could join, unlink, rejoin a different code, and unlink
// again before ever dealing with the first backup.
const SCHEDULE_BACKUP_KEY = 'orbitSyncScheduleBackup';
const MANAGER_ROLE = 'manager';
const VIEWER_ROLE = 'viewer';

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
// Which role a device has is decided entirely by which of the two codes it
// was given (see the Worker's handleSyncRequest) - the code a device typed
// in to create or join resolves to 'manager' or 'viewer' on the server, and
// that resolved role is what setSyncPairing stores here, never a choice the
// client makes for itself. A manager can edit and publish changes; a viewer
// receives updates but is locked out of editing (see isSyncViewer's
// callers: syncTick never pushes for one, and the editor UI locks itself
// down - src/editor-core.js's applyEditorRoleLock) - and, unlike before,
// the Worker itself refuses a viewer's code on PATCH/DELETE too, so this
// isn't just a client-side convention any more. A device paired before this
// feature existed has no role recorded yet; treating that as 'manager'
// preserves its previous (both-can-edit) behavior rather than retroactively
// locking someone out.
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
function getLastKnownSharedStyle() {
  try {
    return JSON.parse(readLocal(LAST_KNOWN_SHARED_STYLE_KEY) || 'null');
  } catch {
    return null;
  }
}
function setLastKnownSharedStyle(data) {
  writeLocal(
    LAST_KNOWN_SHARED_STYLE_KEY,
    JSON.stringify({
      proAccent: data.proAccent,
      proSecondary: data.proSecondary,
      proTertiary: data.proTertiary,
      styleSlots: data.styleSlots
    })
  );
}
function getStyleBackup() {
  try {
    return JSON.parse(readLocal(STYLE_BACKUP_KEY) || 'null');
  } catch {
    return null;
  }
}
function backUpCurrentStyle() {
  writeLocal(
    STYLE_BACKUP_KEY,
    JSON.stringify({
      proAccent: state.applicationData.proAccent,
      proSecondary: state.applicationData.proSecondary,
      proTertiary: state.applicationData.proTertiary,
      styleSlots: state.applicationData.styleSlots
    })
  );
}
function clearStyleBackup() {
  writeLocal(STYLE_BACKUP_KEY, '');
}
function getScheduleBackup() {
  try {
    return JSON.parse(readLocal(SCHEDULE_BACKUP_KEY) || 'null');
  } catch {
    return null;
  }
}
// Takes the data to back up as a parameter, rather than reading
// state.applicationData itself, because by the time performSyncJoin knows
// whether it's actually needed (pullSyncSnapshot's `applied` result), the
// join has already overwritten state.applicationData with the incoming
// data - the pre-join snapshot has to be captured before that happens and
// carried through.
function backUpLocalSchedule(data) {
  writeLocal(SCHEDULE_BACKUP_KEY, JSON.stringify(data));
}
function clearScheduleBackup() {
  writeLocal(SCHEDULE_BACKUP_KEY, '');
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
  writeLocal(LAST_KNOWN_SHARED_STYLE_KEY, '');
  lastPushedSnapshot = null;
}
function clearSyncPairing() {
  writeLocal(CODE_KEY, '');
  writeLocal(ROLE_KEY, '');
  writeLocal(LAST_UPDATE_TIME_KEY, '');
  writeLocal(LEGACY_PROJECT_ID_KEY, '');
  writeLocal(LAST_KNOWN_SHARED_STYLE_KEY, '');
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
  if (response.status === 400) {
    return { ok: true, exists: false, updateTime: '', payload: '', role: null };
  }
  if (!response.ok) return { ok: false, error: await proxyErrorMessage(response) };
  const data = await response.json();
  return {
    ok: true,
    exists: !!data.exists,
    updateTime: data.updateTime || '',
    payload: data.payload || '',
    // Which of the two codes this one turned out to be - resolved by the
    // Worker (see its handleSyncRequest), never asserted by the client. Only
    // meaningful when `exists` is true.
    role: data.role === MANAGER_ROLE ? MANAGER_ROLE : data.role === VIEWER_ROLE ? VIEWER_ROLE : null
  };
}

// Mints a brand new pairing (two fresh, unrelated codes - see the Worker's
// handleSyncCreate) with `payload` as its starting shared schedule. Unlike
// every other request here, this one carries no code at all - there's
// nothing to look up yet, the server is creating something new.
async function createSyncDoc(payload) {
  try {
    const response = await fetch(SYNC_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload })
    });
    if (!response.ok) return { ok: false, error: await proxyErrorMessage(response) };
    const data = await response.json();
    return {
      ok: true,
      managerCode: data.managerCode,
      viewerCode: data.viewerCode,
      updateTime: data.updateTime || ''
    };
  } catch (error) {
    return { ok: false, error: `建立同步失敗：${error.message || error}` };
  }
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

// Wipes the shared document on the server outright - see
// orbitSyncDeleteForEveryone. Unlike writeSyncDoc/fetchSyncDoc, this isn't
// something syncTick's regular loop ever calls; it only ever runs as a
// deliberate, manager-triggered, confirmed action.
async function deleteSyncDoc(code) {
  const response = await fetch(proxyUrl(code), { method: 'DELETE' });
  if (!response.ok) return { ok: false, error: await proxyErrorMessage(response) };
  return { ok: true };
}

// The "has anything actually changed" check syncTick uses to decide whether
// to push ignores style fields entirely once this device has opted out of
// style sync - otherwise its own permanently-different local color would
// look like a pending change forever, and every activity tick would push
// again for no reason. When the opt-out is off this is just a plain
// snapshot, identical to before.
function snapshotForComparison(data) {
  if (!getSyncKeepLocalStyle()) return JSON.stringify(data);
  const rest = { ...data };
  delete rest.proAccent;
  delete rest.proSecondary;
  delete rest.proTertiary;
  delete rest.styleSlots;
  return JSON.stringify(rest);
}
// What actually gets uploaded. Once opted out, this device's own style is
// purely local and must never leak into the shared document - a manager who
// checked the opt-out and then saves *anything* (even something unrelated
// to style) still shouldn't overwrite the shared color scheme everyone else
// sees with their own kept-local one. Substitutes the last style actually
// seen from the shared document instead (see pullSyncSnapshot, which caches
// it on every real pull); falls back to this device's own style if nothing
// has ever been pulled yet (e.g. the very first push right after creating a
// brand new sync, where this device's style *is* what becomes shared).
function dataForPush() {
  if (!getSyncKeepLocalStyle()) return state.applicationData;
  const sharedStyle = getLastKnownSharedStyle();
  return sharedStyle ? { ...state.applicationData, ...sharedStyle } : state.applicationData;
}

// Uploads the currently-saved schedule as-is (never the live, possibly
// unsaved editor form) so sync can never publish a half-edited draft.
async function pushSyncSnapshot() {
  const code = getSyncCode();
  if (!isSyncProxyConfigured() || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const payload = await encodeTransferData(dataForPush());
    const result = await writeSyncDoc(code, payload);
    if (!result.ok) throw new Error(result.error);
    writeLocal(LAST_UPDATE_TIME_KEY, result.updateTime);
    // Owned here, not by callers - applyEditorSettingsData's own
    // immediate-push-on-save (see editor-backup.js) and syncTick's regular
    // poll both funnel through this one function, so this is the one place
    // that reliably knows "what we last actually pushed matches what's live
    // right now" regardless of which caller triggered it.
    lastPushedSnapshot = snapshotForComparison(state.applicationData);
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
//
// Accepts an already-fetched `doc` (performSyncJoin's own role-check GET)
// instead of always issuing its own - joining would otherwise cost two GETs
// for the exact same document (one just to learn the role, one to actually
// pull) when the first one already had everything this function needs.
async function pullSyncSnapshot({ force = false, doc: prefetchedDoc = null } = {}) {
  const code = getSyncCode();
  if (!isSyncProxyConfigured() || !code) return { ok: false, error: '尚未設定同步。' };
  try {
    const doc = prefetchedDoc || (await fetchSyncDoc(code));
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
    // Cache the *real* shared style before any local override below
    // overwrites it on `next` - dataForPush (used by pushSyncSnapshot) needs
    // this to avoid ever pushing this device's kept-local color back out as
    // if it were the shared one.
    setLastKnownSharedStyle(next);
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
    lastPushedSnapshot = snapshotForComparison(state.applicationData);
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
  if (!isSyncConfigured() || !navigator.onLine || document.hidden || syncInFlight) return false;
  syncInFlight = true;
  try {
    if (isEditorDirty()) return false;
    if (isSyncViewer()) {
      const result = await pullSyncSnapshot();
      if (!result.ok) setSyncStatusUi(result.error, true);
      return !!result.applied;
    }
    const currentSnapshot = snapshotForComparison(state.applicationData);
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
  lastPushedSnapshot = snapshotForComparison(state.applicationData);
  syncOnAppActive();
  ACTIVITY_EVENT_TYPES.forEach(type =>
    document.addEventListener(type, onUserActivity, { passive: true })
  );
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncOnAppActive();
});
window.addEventListener('pageshow', syncOnAppActive);

// Held only in memory, never localStorage - see orbitSyncCreate/
// showCreatedSyncCodes. The viewer code in particular is never sent by the
// server again once this is cleared, so this is genuinely the one and only
// chance to see it; losing it before copying it down means creating a new
// sync from scratch.
let pendingCreatedCodes = null;

function showCreatedSyncCodes(managerCode, viewerCode) {
  pendingCreatedCodes = { managerCode, viewerCode };
  const managerCopyBtn = document.getElementById('sync-created-manager-copy');
  const viewerCopyBtn = document.getElementById('sync-created-viewer-copy');
  if (managerCopyBtn) managerCopyBtn.textContent = '複製';
  if (viewerCopyBtn) viewerCopyBtn.textContent = '複製';
  renderSyncPanel();
}
function acknowledgeSyncCreatedCodes() {
  pendingCreatedCodes = null;
  renderSyncPanel();
}
async function copySyncCreatedCode(which) {
  if (!pendingCreatedCodes) return;
  const code =
    which === 'viewer' ? pendingCreatedCodes.viewerCode : pendingCreatedCodes.managerCode;
  const button = document.getElementById(
    which === 'viewer' ? 'sync-created-viewer-copy' : 'sync-created-manager-copy'
  );
  try {
    await copyTransferText(code);
    if (button) button.textContent = '已複製！';
  } catch (error) {
    setSyncStatusUi(`複製失敗：${error.message || error}`, true);
  }
}

function renderSyncPanel() {
  const setupBox = document.getElementById('sync-setup-box');
  const activeBox = document.getElementById('sync-active-box');
  const activeCode = document.getElementById('sync-active-code');
  const roleLabel = document.getElementById('sync-role-label');
  const keepStyleCheckbox = document.getElementById('sync-keep-local-style');
  const styleBackupNotice = document.getElementById('sync-style-backup-notice');
  const deleteAllBtn = document.getElementById('sync-delete-all-btn');
  const createdCodesBox = document.getElementById('sync-created-codes');
  if (!setupBox || !activeBox) return;
  // The freshly-created two-code display takes over the whole panel until
  // acknowledged - showing the setup/active boxes underneath it at the same
  // time would just be confusing, and there's nothing useful to do in this
  // panel until the user has dealt with (i.e. copied down) these codes.
  if (createdCodesBox) createdCodesBox.hidden = !pendingCreatedCodes;
  if (pendingCreatedCodes) {
    setupBox.hidden = true;
    activeBox.hidden = true;
    const managerCodeEl = document.getElementById('sync-created-manager-code');
    const viewerCodeEl = document.getElementById('sync-created-viewer-code');
    if (managerCodeEl) managerCodeEl.textContent = pendingCreatedCodes.managerCode;
    if (viewerCodeEl) viewerCodeEl.textContent = pendingCreatedCodes.viewerCode;
    applyEditorRoleLock();
    return;
  }
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
  // Deleting the shared document affects every paired device, not just this
  // one - only a manager gets the button at all (a viewer can't publish a
  // change either, so wiping the shared document isn't a "my data" decision
  // it should get to make). Purely a UI guardrail, same caveat as the rest
  // of this file's role locks - see orbitSyncDeleteForEveryone's own
  // isSyncViewer() check for the part that actually matters.
  if (deleteAllBtn) deleteAllBtn.hidden = !configured || isSyncViewer();
  if (keepStyleCheckbox) keepStyleCheckbox.checked = getSyncKeepLocalStyle();
  // Shown whenever a backed-up style is sitting around waiting on a
  // decision - regardless of the checkbox's current state, since the user
  // could re-check "不同步樣式顏色" again before ever coming back to deal
  // with the backup from the last time they unchecked it.
  if (styleBackupNotice) styleBackupNotice.hidden = !getStyleBackup();
  applyEditorRoleLock();
}
// Warns before either direction of this toggle takes effect - a native
// checkbox's onchange fires *after* the browser already flipped its visual
// state, so cancelling has to explicitly flip it back, not just leave the
// confirm sheet without acting.
function orbitSyncSetKeepLocalStyle(checked) {
  const wantsKeepLocal = !!checked;
  const checkbox = document.getElementById('sync-keep-local-style');
  const revertCheckbox = () => {
    if (checkbox) checkbox.checked = !wantsKeepLocal;
  };
  setEditorConfirmContent(
    wantsKeepLocal ? '不再同步樣式顏色？' : '恢復同步樣式顏色？',
    wantsKeepLocal
      ? '這台裝置會保留目前的配色：其他裝置改樣式不會再套用過來，這台裝置的配色也不會覆蓋共用樣式。課表內容仍會照常同步。'
      : '這台裝置會恢復接收共用樣式——下次同步時，目前保留的配色會立刻被共用樣式取代。系統會先備份目前的配色，之後可以在這裡按「還原保留的樣式」拿回來。',
    '',
    wantsKeepLocal ? '不再同步樣式' : '恢復同步',
    () => {
      hideEditorDiscardConfirm();
      // The one genuinely destructive direction: turning this off means
      // the very next sync overwrites whatever's here now. Back it up
      // first so renderSyncPanel's recovery option (see below) has
      // something to offer, in case the shared style wasn't actually what
      // they wanted after all.
      if (!wantsKeepLocal) backUpCurrentStyle();
      setSyncKeepLocalStyle(wantsKeepLocal);
      // The style tool's own lock (see applyEditorRoleLock) depends on this
      // setting too, not just role - refresh it immediately so confirming
      // unlocks/locks the style button right away, no reload or re-pair
      // needed.
      applyEditorRoleLock();
      renderSyncPanel();
      // Don't wait for the next touch-triggered check (see the
      // activity-driven sync section below) - a style-sync change is
      // exactly the kind of moment where the user wants the effect to show
      // up right away, not whenever they next happen to click something.
      syncTick();
    },
    '取消',
    {
      cancelHandler: () => {
        hideEditorDiscardConfirm();
        revertCheckbox();
      }
    }
  );
  showEditorConfirmSheet();
}
// The recovery half of the safety net above: reapplies whatever style was
// backed up right before the user last turned sync-style back on, and
// re-enables the opt-out so it isn't just immediately overwritten again by
// the very next sync. A deliberate, explicit action (its own button, not
// bundled into some other flow) so it doesn't need its own confirmation
// sheet on top of everything else here.
function orbitSyncRestoreStyleBackup() {
  const backup = getStyleBackup();
  if (!backup) return;
  // Re-enable the opt-out first - restoring the old colors only to have the
  // very next sync immediately overwrite them again would defeat the point.
  setSyncKeepLocalStyle(true);
  const next = {
    ...state.applicationData,
    proAccent: backup.proAccent,
    proSecondary: backup.proSecondary,
    proTertiary: backup.proTertiary,
    styleSlots: backup.styleSlots
  };
  // fromSync:true here isn't about where the data came from - it's to get
  // the same "don't push this back out" behavior applyEditorSettingsData
  // already gives a sync-applied change, which is exactly what a pure
  // local restore also needs (setSyncKeepLocalStyle(true) above would make
  // any push substitute the shared style anyway, so this is belt-and-
  // suspenders more than strictly load-bearing).
  applyEditorSettingsData(next, { fromSync: true });
  clearStyleBackup();
  applyEditorRoleLock();
  renderSyncPanel();
  setSyncStatusUi('已還原保留的樣式，並重新開啟「不同步樣式顏色」。');
}
function orbitSyncDismissStyleBackup() {
  clearStyleBackup();
  renderSyncPanel();
}
// The recovery half of the schedule-backup safety net (see
// SCHEDULE_BACKUP_KEY) - reapplies whatever local schedule this device had
// right before it last joined a sync that actually overwrote it. Only ever
// offered after that pairing is already gone (unlinked or deleted), so
// there's no "don't push this back out" concern to worry about the way the
// style restore above has - isSyncConfigured() is already false by the time
// this is reachable.
function orbitSyncRestoreScheduleBackup() {
  const backup = getScheduleBackup();
  if (!backup) return;
  applyEditorSettingsData(backup);
  clearScheduleBackup();
  renderSyncPanel();
  setSyncStatusUi('已還原加入同步前的本機課表。');
}
function orbitSyncDismissScheduleBackup() {
  clearScheduleBackup();
  renderSyncPanel();
}
// The actual moment "did you want your old schedule back, or is the one
// you've been using fine" becomes a real question: right after unlinking or
// deleting leaves this device on its own again - not a standing notice
// tucked into the sync panel that's easy to never scroll back to. Chained
// straight out of the unlink/delete confirm handlers below, right after
// clearSyncPairing() actually takes effect; a no-op if there's nothing to
// offer back (either this device never joined, or the join never replaced
// anything - see backUpLocalSchedule's caller in performSyncJoin).
function promptScheduleBackupRestore() {
  const backup = getScheduleBackup();
  if (!backup) return;
  setEditorConfirmContent(
    '找回加入同步前的課表？',
    '這台裝置加入同步前的本機課表已經備份起來了。要換回加入前的課表，還是繼續使用剛剛同步下來的課表？',
    '',
    '換回加入前的課表',
    () => {
      hideEditorDiscardConfirm();
      orbitSyncRestoreScheduleBackup();
    },
    '繼續使用目前課表',
    {
      cancelHandler: () => {
        hideEditorDiscardConfirm();
        orbitSyncDismissScheduleBackup();
      }
    }
  );
  showEditorConfirmSheet();
}

// Locks a viewer device out of the schedule editor entirely (its button,
// not a greyed-out shell) and out of the AI/manual import actions in the
// separate "同步 / 匯入匯出" sheet (where the unlink button that gets a
// viewer back to full local editing lives - that sheet itself always stays
// reachable). This is a UX guardrail, not a real access-control boundary -
// same as the rest of sync's design (see README's security section) - so
// it's plain CSS (.is-disabled/.sync-viewer-locked, see styles.css) rather
// than anything that actually removes the underlying form controls.
function applyEditorRoleLock() {
  const viewer = isSyncViewer();
  // A viewer is never allowed into the schedule editor at all, full stop -
  // unlike the style tool below, there's no opt-out that changes this. The
  // schedule editor now holds nothing a viewer legitimately needs (sync
  // status, unlink, AI/manual import all live in the separate transfer
  // sheet instead, which stays reachable), so the button is locked outright
  // instead of letting it open into a greyed-out shell. openEditor() itself
  // also refuses for a viewer (editor-core.js) - the real check this button
  // lock is only a UI shortcut for, same belt-and-suspenders reasoning as
  // every other role lock in this file.
  const editButton = document.getElementById('btn-edit');
  if (editButton) {
    editButton.classList.toggle('is-disabled', viewer);
    editButton.title = viewer
      ? '此裝置僅接收同步，無法編輯課表。如要自行編輯，請先在「同步 / 匯入匯出」解除同步。'
      : '編輯課表';
  }
  // The transfer sheet itself stays open to both roles (a viewer needs to
  // reach its sync status/unlink), but AI import and manual import are
  // still real ways to overwrite the local schedule, so they get locked
  // individually within it - see the matching .transfer-sheet.sync-viewer-
  // locked rule in styles.css. Manual export stays enabled - reading out
  // the currently-synced schedule isn't editing it.
  const transferSheet = document.getElementById('transfer-sheet');
  if (transferSheet) transferSheet.classList.toggle('sync-viewer-locked', viewer);
  // The style tool is a separate top-bar overlay with its own opt-out-
  // dependent lock: a viewer who's still accepting synced colors (hasn't
  // checked "不同步樣式顏色") has no real use for it - any local color
  // change it made would just get overwritten by the next pulled update
  // anyway, which is confusing busywork, not a real feature. A viewer
  // who *has* opted out is exempt - that's the whole point of the opt-out
  // - and a manager is never locked out of it at all, since setting the
  // shared style in the first place is the manager's job.
  const styleButton = document.getElementById('btn-style');
  if (styleButton) {
    const locked = viewer && !getSyncKeepLocalStyle();
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
  if (!navigator.onLine) {
    setSyncStatusUi('目前沒有網路連線，無法建立同步。', true);
    return;
  }
  await withButtonDisabled('sync-create-btn', async () => {
    setSyncStatusUi('正在建立同步…');
    const payload = await encodeTransferData(state.applicationData);
    const result = await createSyncDoc(payload);
    if (!result.ok) {
      setSyncStatusUi(result.error, true);
      return;
    }
    // This device becomes the manager - it already has the schedule that
    // was just published, so there's nothing left to pull.
    setSyncPairing(result.managerCode, MANAGER_ROLE);
    writeLocal(LAST_UPDATE_TIME_KEY, result.updateTime);
    lastPushedSnapshot = snapshotForComparison(state.applicationData);
    // The viewer code is never stored anywhere and never sent back by the
    // server again once this response is gone - it exists nowhere but this
    // one reply and whatever the user copies out of it now. showCreatedSyncCodes
    // holds both codes on-screen (see renderSyncPanel) until acknowledged.
    showCreatedSyncCodes(result.managerCode, result.viewerCode);
    renderSyncPanel();
    startSyncLoop();
  });
}
// A lightweight existence-and-role check, deliberately not going through
// setSyncPairing/pullSyncSnapshot - those read the *currently paired* code
// from localStorage, but orbitSyncJoin needs to check a code before
// committing to anything (or showing a warning that only makes sense if the
// code actually has data to overwrite with, and that names the right role).
async function checkSyncCodeExists(code) {
  try {
    const doc = await fetchSyncDoc(code);
    if (!doc.ok) return { ok: false, error: `同步檢查失敗：${doc.error}` };
    return { ok: true, exists: doc.exists, role: doc.role };
  } catch (error) {
    return { ok: false, error: `同步檢查失敗：${error.message || error}` };
  }
}

async function orbitSyncJoin() {
  if (!isSyncProxyConfigured()) {
    setSyncStatusUi('跨裝置同步功能尚未設定，請聯絡課表管理者。', true);
    return;
  }
  if (!navigator.onLine) {
    setSyncStatusUi('目前沒有網路連線，無法加入同步。', true);
    return;
  }
  const code = document.getElementById('sync-join-code')?.value.trim();
  if (!code) {
    setSyncStatusUi('請輸入配對代碼。', true);
    return;
  }
  const normalizedCode = code.toUpperCase();

  await withButtonDisabled('sync-join-btn', async () => {
    // Check the code actually has something to join *before* ever showing
    // the overwrite warning below - a nonexistent/mistyped code has nothing
    // to overwrite with, so warning about data loss and then failing anyway
    // (the bug performSyncJoin's own `exists` check already prevents) was
    // just a confusing, pointless extra step. Fail fast with the real error
    // instead. This same check also resolves which role the typed code
    // actually is - there's no "以管理者身份加入" choice any more; the
    // server decides that from the code itself (see the Worker's
    // handleSyncRequest), so this is purely to tell the user what to expect
    // before they confirm, not to ask them to pick.
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
    const roleText =
      check.role === MANAGER_ROLE
        ? '管理者代碼（可以編輯課表）'
        : '接收者代碼（僅能接收，無法編輯）';
    setEditorConfirmContent(
      '加入同步？',
      `這是一組「${roleText}」。這組代碼下已經有課表，加入後會立刻用該課表取代這台裝置目前的課表，且無法復原。建立同步的裝置目前的課表不會受影響。`,
      '',
      '仍要加入',
      () => {
        hideEditorDiscardConfirm();
        performSyncJoin(normalizedCode);
      },
      '取消'
    );
    showEditorConfirmSheet();
  });
}

async function performSyncJoin(code) {
  // Captured before setSyncPairing/pullSyncSnapshot can touch anything - see
  // SCHEDULE_BACKUP_KEY's comment. Not written to storage yet: only
  // committed below once the join actually replaces local data.
  const preJoinSchedule = cloneSettingsData(state.applicationData);
  setSyncStatusUi('正在加入同步…');
  const doc = await fetchSyncDoc(code);
  if (!doc.ok) {
    setSyncStatusUi(doc.error, true);
    return;
  }
  // "加入同步" only ever joins a sync someone already created (with
  // "建立新同步", which mints its own two codes and immediately publishes) -
  // "not found" here means this code was mistyped or never created, not "an
  // empty sync to adopt." Bug this used to have: this case used to report
  // success and pair the device anyway (worse for a viewer, who'd then just
  // sit there forever receiving nothing, thinking it was synced). Refusing
  // outright also removes the old "join as manager silently
  // creates/publishes under whatever code you typed" fallback - that's what
  // "建立新同步" is for.
  if (!doc.exists) {
    setSyncStatusUi('找不到這組配對代碼，請確認代碼是否正確，或請對方先按「建立新同步」。', true);
    return;
  }
  // The role is whatever the server resolved this code to (see
  // fetchSyncDoc) - never a choice made here. Paired immediately so the
  // pull below (reusing this same fetch - see pullSyncSnapshot's `doc`
  // option, which avoids a second, redundant GET for the same document)
  // applies against the right role's local storage keys.
  const role = doc.role === MANAGER_ROLE ? MANAGER_ROLE : VIEWER_ROLE;
  setSyncPairing(code, role);
  const result = await pullSyncSnapshot({ force: true, doc });
  if (!result.ok) {
    clearSyncPairing();
    setSyncStatusUi(result.error, true);
    return;
  }
  // Only actually replaced local data if pullSyncSnapshot applied something
  // - the shared document could turn out to already match this device's
  // schedule exactly, in which case nothing was lost and there's nothing
  // worth offering to restore later.
  if (result.applied) backUpLocalSchedule(preJoinSchedule);
  renderSyncPanel();
  setSyncStatusUi(role === MANAGER_ROLE ? '已以管理者身份加入同步。' : '已加入同步（僅接收）。');
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
      promptScheduleBackupRestore();
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
// The strictly more destructive sibling of orbitSyncUnlink above: that one
// only ever forgets this device's own pairing, leaving the shared document
// (and every other device still reading it) untouched. This one reaches
// into the server and deletes the shared document itself, so every device
// paired under this code loses its sync target at once - the next time any
// of them syncs, the code simply resolves to nothing any more (see
// pullSyncSnapshot's `exists: false` path). There is no undo and no way to
// warn the other devices first beyond what this device's own confirmation
// text says, so this gets its own, more explicit warning than a plain
// unlink - manager-only (see the `sync-delete-all-btn` hidden toggle in
// renderSyncPanel, and the isSyncViewer() guard below as the real check a
// hidden button alone never is, same reasoning as every other role lock in
// this file).
function orbitSyncDeleteForEveryone() {
  if (isSyncViewer()) return;
  const code = getSyncCode();
  if (!isSyncConfigured()) return;
  if (!navigator.onLine) {
    setSyncStatusUi('目前沒有網路連線，無法刪除同步。', true);
    return;
  }
  setEditorConfirmContent(
    '整個刪除這組同步？',
    '這會把伺服器上的共用課表整個刪除，這組同步底下的管理者代碼與接收者代碼會一起立刻失效：所有用這兩組代碼加入的裝置（不只這一台）都會斷開連結，之後同步時會發現代碼已經不存在，各自變回自己最後一次收到的本機課表。此動作無法復原。',
    '',
    '整個刪除',
    async () => {
      hideEditorDiscardConfirm();
      setSyncStatusUi('正在刪除同步…');
      const result = await deleteSyncDoc(code);
      if (!result.ok) {
        setSyncStatusUi(`刪除失敗：${result.error}`, true);
        return;
      }
      clearSyncPairing();
      renderSyncPanel();
      setSyncStatusUi('已整個刪除同步，所有裝置都已斷開連結（本機課表不受影響）。');
      promptScheduleBackupRestore();
    },
    '取消'
    // No copy-code option here (unlike orbitSyncUnlink) - once this
    // succeeds the code is permanently dead for everyone, so a copy of it
    // would be useless for rejoining.
  );
  showEditorConfirmSheet();
}

window.orbitSyncCreate = orbitSyncCreate;
window.orbitSyncJoin = orbitSyncJoin;
window.orbitSyncUnlink = orbitSyncUnlink;
window.orbitSyncDeleteForEveryone = orbitSyncDeleteForEveryone;
window.orbitSyncSetKeepLocalStyle = orbitSyncSetKeepLocalStyle;
window.orbitSyncRestoreStyleBackup = orbitSyncRestoreStyleBackup;
window.orbitSyncDismissStyleBackup = orbitSyncDismissStyleBackup;
window.copySyncCreatedCode = copySyncCreatedCode;
window.acknowledgeSyncCreatedCodes = acknowledgeSyncCreatedCodes;

export {
  acknowledgeSyncCreatedCodes,
  applyEditorRoleLock,
  clearSyncPairing,
  getScheduleBackup,
  getStyleBackup,
  getSyncCode,
  getSyncKeepLocalStyle,
  getSyncRole,
  isSyncConfigured,
  isSyncProxyConfigured,
  isSyncViewer,
  orbitSyncCreate,
  orbitSyncDeleteForEveryone,
  orbitSyncDismissScheduleBackup,
  orbitSyncDismissStyleBackup,
  orbitSyncJoin,
  orbitSyncRestoreScheduleBackup,
  orbitSyncRestoreStyleBackup,
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
