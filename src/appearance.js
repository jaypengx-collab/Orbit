// ---- src/appearance.js ----
// Theme colors, light/dark mode, and the style panel's preview/save flow.
import { state } from './state.js';
import { closeTestPanel, setOverlayVisible } from './dashboard.js';
import { fitNowTitleText } from './dashboard-render.js';
import { DEFAULT_STYLE_PRIMARY, DEFAULT_STYLE_SECONDARY } from './constants.js';
import { applyEditorSettingsData, cloneSettingsData, isEditorDirty } from './editor-backup.js';
import {
  closeEditor,
  esc,
  hasUnconsumedImportData,
  hideEditorDiscardConfirm,
  setEditorConfirmContent,
  showEditorConfirmSheet,
  showEditorDiscardConfirm
} from './editor-core.js';

// ---- js/appearance.js ----
function normalizeProAccent(value) {
  const color = String(value || '')
    .trim()
    .toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_STYLE_PRIMARY;
}
function normalizeProSecondary(value) {
  const color = String(value || '')
    .trim()
    .toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_STYLE_SECONDARY;
}
function normalizeProTertiary(value) {
  const color = String(value || '')
    .trim()
    .toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : '#91AE78';
}
function getReadableTextColor(value) {
  const color = normalizeProAccent(value).slice(1);
  const channels = [0, 2, 4]
    .map(index => parseInt(color.slice(index, index + 2), 16) / 255)
    .map(channel =>
      channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
    );
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return darkContrast >= whiteContrast ? '#10171A' : '#FFFFFF';
}
function getReadableSurfaceColor(value) {
  const color = normalizeProAccent(value).slice(1);
  const channels = [0, 2, 4]
    .map(index => parseInt(color.slice(index, index + 2), 16) / 255)
    .map(channel =>
      channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
    );
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const surfaceLuminance = 0.008;
  const contrast =
    (Math.max(luminance, surfaceLuminance) + 0.05) / (Math.min(luminance, surfaceLuminance) + 0.05);
  return contrast >= 3 ? '#' + color : '#F4FBFF';
}
function normalizeStyleSlots(value) {
  const slots = Array.isArray(value) ? value : [];
  return Array.from({ length: 5 }, (_, index) => {
    const source = slots[index] && typeof slots[index] === 'object' ? slots[index] : {};
    return {
      name: String(source.name || '')
        .trim()
        .slice(0, 12),
      primary: normalizeProAccent(source.primary),
      secondary: normalizeProSecondary(source.secondary)
    };
  });
}
function deriveProSupportColors(primary) {
  const color = normalizeProAccent(primary).slice(1);
  const rgb = [0, 2, 4].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
  const max = Math.max(...rgb),
    min = Math.min(...rgb),
    delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rgb[0]) hue = 60 * (((rgb[1] - rgb[2]) / delta) % 6);
    else if (max === rgb[1]) hue = 60 * ((rgb[2] - rgb[0]) / delta + 2);
    else hue = 60 * ((rgb[0] - rgb[1]) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const toHex = value =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  const hslToHex = (h, s, l) => {
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const match =
      h < 60
        ? [chroma, x, 0]
        : h < 120
          ? [x, chroma, 0]
          : h < 180
            ? [0, chroma, x]
            : h < 240
              ? [0, x, chroma]
              : h < 300
                ? [x, 0, chroma]
                : [chroma, 0, x];
    const matchMin = l - chroma / 2;
    return `#${match.map(value => toHex(value + matchMin)).join('')}`;
  };
  return {
    secondary: hslToHex(
      (hue + 28) % 360,
      Math.max(0.28, Math.min(0.66, saturation * 0.72)),
      Math.max(0.38, Math.min(0.56, lightness * 0.92))
    ),
    tertiary: hslToHex(
      (hue + 190) % 360,
      Math.max(0.18, Math.min(0.42, saturation * 0.48)),
      Math.max(0.5, Math.min(0.7, lightness * 1.18))
    )
  };
}
const PRO_PALETTE_PRESETS = {
  default: { primary: DEFAULT_STYLE_PRIMARY, secondary: DEFAULT_STYLE_SECONDARY },
  rose: { primary: '#F06F61', secondary: '#C44C78' },
  ocean: { primary: '#18B7A0', secondary: '#2E6FD8' },
  midnight: { primary: '#263B68', secondary: '#6A4C93' },
  graphite: { primary: '#A7C957', secondary: '#557A3E' }
};
function applyProAccent(data = state.applicationData) {
  const accent = normalizeProAccent(data.proAccent);
  const secondary = normalizeProSecondary(data.proSecondary);
  document.body.style.setProperty('--pro-accent', accent);
  document.body.style.setProperty('--pro-secondary', secondary);
  document.body.style.setProperty('--pro-accent-text', getReadableTextColor(accent));
  document.body.style.setProperty('--pro-secondary-text', getReadableTextColor(secondary));
  document.body.style.setProperty('--pro-accent-readable', getReadableSurfaceColor(accent));
  document.body.style.setProperty('--pro-secondary-readable', getReadableSurfaceColor(secondary));
}
// Style-panel changes are previewed first, then committed through the save pipeline.
// Switches to the Orbit Color visual skin.
function setStyleMode() {
  document.body.classList.add('pro-style');
  applyProAccent();
  renderStylePanel();
  refreshStyleModeLayout();
}
function refreshStyleModeLayout() {
  requestAnimationFrame(() => {
    const list = document.getElementById('schedule-list');
    if (list) {
      state.lastAutoScrollKey = null;
    }
    if (typeof window.update === 'function') window.update();
    requestAnimationFrame(() => {
      if (typeof fitNowTitleText === 'function') fitNowTitleText(true);
    });
  });
}
function renderStylePanel() {
  state.stylePanelDraft = {
    ...state.applicationData,
    styleSlots: normalizeStyleSlots(state.applicationData.styleSlots)
  };
  const primary = document.getElementById('style-primary-input');
  const secondary = document.getElementById('style-secondary-input');
  if (primary) primary.value = normalizeProAccent(state.applicationData.proAccent);
  if (secondary) secondary.value = normalizeProSecondary(state.applicationData.proSecondary);
  document.getElementById('style-panel')?.classList.remove('style-draft-dirty');
  renderStyleSlots();
  setStylePanelMode('editor');
}
function getStyleDraftFromControls() {
  const primary = document.getElementById('style-primary-input');
  const secondary = document.getElementById('style-secondary-input');
  return {
    ...state.stylePanelDraft,
    proAccent: normalizeProAccent(primary?.value || state.stylePanelDraft.proAccent),
    proSecondary: normalizeProSecondary(secondary?.value || state.stylePanelDraft.proSecondary),
    proTertiary: normalizeProSecondary(secondary?.value || state.stylePanelDraft.proSecondary)
  };
}
function previewStyleSettings() {
  state.stylePanelDraft = getStyleDraftFromControls();
  applyStyleVisual(state.stylePanelDraft);
  document.getElementById('style-panel')?.classList.add('style-draft-dirty');
}
function setStylePanelMode(mode) {
  const editor = document.getElementById('style-editor-content');
  const preview = document.getElementById('style-preview-state');
  const editorActions = document.getElementById('style-editor-actions');
  const isPreview = mode === 'preview';
  if (editor) editor.hidden = isPreview;
  if (preview) preview.hidden = !isPreview;
  if (editorActions) editorActions.hidden = isPreview;
}
function enterStylePreview() {
  state.stylePanelDraft = getStyleDraftFromControls();
  applyStyleVisual(state.stylePanelDraft);
  document.getElementById('style-panel')?.classList.add('style-draft-dirty');
  setStylePanelMode('preview');
}
function exitStylePreview() {
  setStylePanelMode('editor');
}
function applyStyleVisual(style) {
  document.body.classList.add('pro-style');
  applyProAccent(style);
  if (typeof window.update === 'function') window.update();
}
// Builds the preview draft into a full settings object and saves it with the
// same settings pipeline used by the class editor.
function confirmStyleSettings() {
  state.stylePanelDraft = state.stylePanelDraft || getStyleDraftFromControls();
  const next = cloneSettingsData(state.applicationData);
  next.proAccent = normalizeProAccent(state.stylePanelDraft.proAccent);
  next.proSecondary = normalizeProSecondary(state.stylePanelDraft.proSecondary);
  next.proTertiary = next.proSecondary;
  next.styleSlots = normalizeStyleSlots(state.stylePanelDraft.styleSlots);
  state.pendingStyleSaveData = next;
  applyPendingStyleSave();
}
// Commits a confirmed style change through the same applyEditorSettingsData
// pipeline as saving or importing the class editor (saves, rebuilds the
// schedule, refreshes the editor baseline, and shows the save toast).
function applyPendingStyleSave() {
  if (!state.pendingStyleSaveData) {
    hideEditorDiscardConfirm();
    return;
  }
  applyEditorSettingsData(state.pendingStyleSaveData, { statusMessage: '樣式已儲存。' });
  setStyleMode('pro');
  state.pendingStyleSaveData = null;
  document.getElementById('style-panel')?.classList.remove('style-draft-dirty');
  hideEditorDiscardConfirm();
  closeStylePanel();
}
function renderStyleSlots() {
  const grid = document.getElementById('style-slot-grid');
  if (!grid) return;
  const slots = normalizeStyleSlots(
    state.stylePanelDraft?.styleSlots || state.applicationData.styleSlots
  );
  grid.innerHTML = slots
    .map(
      (slot, index) =>
        `<div class="style-slot-row"><button type="button" class="style-slot ${slot.name ? 'has-style' : ''}" style="--slot-primary:${slot.primary};--slot-secondary:${slot.secondary}" onclick="loadStyleSlot(${index})" aria-label="${esc(slot.name || `空位 ${index + 1}`)}" title="${esc(slot.name || `空位 ${index + 1}`)}"><span class="style-slot-swatch" aria-hidden="true"></span></button><button type="button" class="style-slot-save" onclick="saveStyleSlot(${index})" aria-label="儲存至樣式 ${index + 1}">＋</button></div>`
    )
    .join('');
}
function saveStyleSlot(index) {
  state.stylePanelDraft = getStyleDraftFromControls();
  const slots = normalizeStyleSlots(state.stylePanelDraft.styleSlots);
  if (slots[index]?.name) {
    state.pendingStyleSlotSaveIndex = index;
    setEditorConfirmContent(
      '覆寫個人樣式？',
      '這會取代目前儲存在這個位置的配色。',
      '',
      '覆寫',
      applyPendingStyleSlotSave,
      '取消'
    );
    showEditorConfirmSheet();
    return;
  }
  saveStyleSlotDraft(index);
}
function saveStyleSlotDraft(index) {
  const slots = normalizeStyleSlots(state.stylePanelDraft.styleSlots);
  slots[index] = {
    name: slots[index].name || `樣式 ${index + 1}`,
    primary: state.stylePanelDraft.proAccent,
    secondary: state.stylePanelDraft.proSecondary
  };
  state.stylePanelDraft.styleSlots = slots;
  renderStyleSlots();
  setStylePanelMode('editor');
}
function applyPendingStyleSlotSave() {
  const index = state.pendingStyleSlotSaveIndex;
  state.pendingStyleSlotSaveIndex = null;
  hideEditorDiscardConfirm();
  if (index !== null) saveStyleSlotDraft(index);
}
function loadStyleSlot(index) {
  const slot = normalizeStyleSlots(
    state.stylePanelDraft?.styleSlots || state.applicationData.styleSlots
  )[index];
  if (!slot || !slot.name) return;
  state.pendingStyleSlotIndex = index;
  setEditorConfirmContent(
    '套用儲存樣式？',
    '目前的樣式將被替換。',
    '',
    '套用',
    applyPendingStyleSlot,
    '返回'
  );
  showEditorConfirmSheet();
}
function applyPendingStyleSlot() {
  const slot = normalizeStyleSlots(
    state.stylePanelDraft?.styleSlots || state.applicationData.styleSlots
  )[state.pendingStyleSlotIndex];
  if (!slot || !slot.name) return;
  document.getElementById('style-primary-input').value = slot.primary;
  document.getElementById('style-secondary-input').value = slot.secondary;
  state.pendingStyleSlotIndex = null;
  hideEditorDiscardConfirm();
  previewStyleSettings();
}
async function toggleStylePanel() {
  const editor = document.getElementById('editor-sheet');
  if (editor.classList.contains('show')) {
    if (isEditorDirty() || (await hasUnconsumedImportData())) {
      state.pendingAfterEditorDiscard = 'style';
      await showEditorDiscardConfirm();
      return;
    }
    closeEditor(true);
  }
  const panel = document.getElementById('style-panel');
  if (panel.classList.contains('show')) {
    closeStylePanel();
  } else {
    closeTestPanel();
    openStylePanel();
  }
}
// Opens Style Mode directly (used by the toolbar toggle and, after
// discarding editor changes, by discardEditorChangesAndClose).
function openStylePanel(resetDraft = true) {
  if (resetDraft || !state.stylePanelDraft) renderStylePanel();
  setOverlayVisible('style-panel-overlay', 'style-panel', true, 'style-panel-open');
}
function closeStylePanel() {
  const panel = document.getElementById('style-panel');
  if (panel.classList.contains('show') && panel.classList.contains('style-draft-dirty')) {
    showStyleDiscardConfirm();
    return;
  }
  setOverlayVisible('style-panel-overlay', 'style-panel', false, 'style-panel-open');
}
function showStyleDiscardConfirm() {
  setEditorConfirmContent(
    '尚未套用樣式？',
    '離開將捨棄目前的樣式預覽。',
    '',
    '捨棄並離開',
    discardStyleChangesAndClose,
    '返回'
  );
  showEditorConfirmSheet();
}
function discardStyleChangesAndClose() {
  hideEditorDiscardConfirm();
  setOverlayVisible('style-panel-overlay', 'style-panel', false, 'style-panel-open');
  setStyleMode('pro');
  document.getElementById('style-panel')?.classList.remove('style-draft-dirty');
}
function applyStylePreset(name) {
  const preset = PRO_PALETTE_PRESETS[name];
  if (!preset) return;
  const primary = document.getElementById('style-primary-input');
  const secondary = document.getElementById('style-secondary-input');
  if (primary) primary.value = preset.primary;
  if (secondary)
    secondary.value = preset.secondary || deriveProSupportColors(preset.primary).secondary;
  previewStyleSettings();
}

// Exposed on window for inline HTML event handlers (onclick="..." in
// index.html and in generated template strings).
window.applyStylePreset = applyStylePreset;
window.closeStylePanel = closeStylePanel;
window.confirmStyleSettings = confirmStyleSettings;
window.enterStylePreview = enterStylePreview;
window.exitStylePreview = exitStylePreview;
window.loadStyleSlot = loadStyleSlot;
window.previewStyleSettings = previewStyleSettings;
window.saveStyleSlot = saveStyleSlot;
window.toggleStylePanel = toggleStylePanel;

export {
  applyProAccent,
  closeStylePanel,
  deriveProSupportColors,
  normalizeProAccent,
  normalizeProSecondary,
  normalizeProTertiary,
  normalizeStyleSlots,
  openStylePanel,
  setStyleMode
};
