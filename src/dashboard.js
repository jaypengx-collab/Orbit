// ---- src/dashboard.js ----
import { state } from './state.js';
import { closeStylePanel } from './appearance.js';
import { fitNowTitleText, getClassColor, renderList } from './dashboard-render.js';
import { dayNames, formatCountdownEventDate, normalizeCountdownEvents } from './data.js';
import { isEditorDirty } from './editor-backup.js';
import {
  closeEditor,
  esc,
  hasUnconsumedImportData,
  hideEditorDiscardConfirm,
  showEditorDiscardConfirm
} from './editor-core.js';
import { closeAssignSheet } from './editor-teachers.js';
import {
  getNextSchoolDay,
  getWeekLabelHtml,
  getWeekType,
  pad2,
  processSplitName
} from './schedule.js';
import { computeDashboardViewModel } from './schedule-calc.js';

// ---- js/dashboard.js ----
// Opens or closes the manual time simulation panel.
// Modal and toolbar state is separate from saved schedule settings.
async function toggleTestPanel() {
  const editorSheet = document.getElementById('editor-sheet');
  if (editorSheet.classList.contains('show')) {
    if (isEditorDirty() || (await hasUnconsumedImportData())) {
      state.pendingAfterEditorDiscard = 'test';
      await showEditorDiscardConfirm();
      return;
    }
    closeEditor(true);
  }
  state.testPanelOpen = !state.testPanelOpen;
  setOverlayVisible('test-panel-overlay', 'debug-panel', state.testPanelOpen);
  closeStylePanel();
  syncTestToolbar();
}
// Closes the manual time simulation panel.
function closeTestPanel() {
  state.testPanelOpen = false;
  setOverlayVisible('test-panel-overlay', 'debug-panel', false);
  syncTestToolbar();
}
// Opens Test Mode directly after another UI has been safely closed.
function openTestPanel() {
  state.testPanelOpen = true;
  setOverlayVisible('test-panel-overlay', 'debug-panel', true);
  syncTestToolbar();
}
// Keeps the toolbar test button state in sync with simulation mode.
function syncTestToolbar() {
  const btn = document.getElementById('btn-test');
  if (!btn) return;
  btn.classList.toggle('active', state.testPanelOpen);
  btn.classList.toggle('manual-test-on', !!window.MANUALLY_TEST);
  btn.classList.toggle('sim-running', !!window.IS_SIMULATING);
}
// Wires the grab handle on a bottom sheet (test/style panel) to an actual
// swipe-down-to-dismiss gesture, matching the affordance the handle implies.
// closeFn is called on a successful dismiss so guards like the style panel's
// unsaved-changes confirm still run; if it declines to close (panel keeps
// the 'show' class), the sheet snaps back open instead of staying hidden.
function bindSheetDragToDismiss(panelId, closeFn) {
  const panel = document.getElementById(panelId);
  const handle = panel && panel.querySelector('.test-panel-handle');
  if (!panel || !handle) return;
  let dragging = false;
  let startY = 0;
  const threshold = 90;
  const settle = open => {
    panel.style.transition = open
      ? 'transform .35s cubic-bezier(.16,1,.3,1)'
      : 'transform .22s cubic-bezier(.4,0,1,1)';
    panel.style.transform = open ? 'translateY(0)' : `translateY(${panel.offsetHeight + 40}px)`;
    setTimeout(
      () => {
        panel.style.transition = '';
        panel.style.transform = '';
      },
      open ? 360 : 230
    );
  };
  const move = event => {
    if (!dragging) return;
    const deltaY = Math.max(0, event.clientY - startY);
    panel.style.transform = `translateY(${deltaY}px)`;
  };
  const finish = event => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    const deltaY = Math.max(0, event.clientY - startY);
    if (deltaY <= threshold) {
      settle(true);
      return;
    }
    panel.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)';
    panel.style.transform = `translateY(${panel.offsetHeight + 40}px)`;
    setTimeout(() => {
      closeFn();
      requestAnimationFrame(() => settle(panel.classList.contains('show')));
    }, 220);
  };
  handle.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startY = event.clientY;
    panel.style.transition = 'none';
    handle.classList.add('is-dragging');
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });
}
bindSheetDragToDismiss('debug-panel', closeTestPanel);
bindSheetDragToDismiss('style-panel', closeStylePanel);
bindSheetDragToDismiss('sheet', closeModal);
// Changes the visible day when a navigation tab is pressed.
function handleNav(d) {
  state.viewDay = d;
  window.update();
}
/* Tool menu and viewport fitting. */
function setToolHubState(open) {
  const actions = document.querySelector('.top-actions');
  const btn = document.getElementById('btn-menu');
  if (!actions || !btn) return;
  actions.classList.toggle('open', !!open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  const label = open ? '關閉工具' : '開啟工具';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
}
function toggleActionMenu() {
  const actions = document.querySelector('.top-actions');
  setToolHubState(!(actions && actions.classList.contains('open')));
}
let modalPreviousFocus = null;
document.addEventListener(
  'click',
  event => {
    const actions = document.querySelector('.top-actions');
    if (!actions || !actions.classList.contains('open')) return;
    if (!actions.contains(event.target)) setToolHubState(false);
  },
  { capture: true }
);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (document.getElementById('assign-sheet')?.classList.contains('show')) closeAssignSheet();
  else if (document.getElementById('sheet')?.classList.contains('show')) closeModal();
  else if (document.getElementById('editor-confirm-sheet')?.classList.contains('show'))
    hideEditorDiscardConfirm();
  else if (document.getElementById('debug-panel')?.classList.contains('show')) closeTestPanel();
  else if (document.getElementById('style-panel')?.classList.contains('show')) closeStylePanel();
  else if (document.getElementById('editor-sheet')?.classList.contains('show')) closeEditor();
  else setToolHubState(false);
});
['btn-edit', 'btn-test', 'btn-style'].forEach(id => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => setTimeout(() => setToolHubState(false), 80));
});

let activeCountdownIndex = 0;
// Countdown cards can be switched with a horizontal swipe on touch devices.
function getCountdownEvents(data = state.applicationData) {
  return normalizeCountdownEvents(data?.countdownEvents ?? []);
}
function showCountdownEvent(index) {
  const events = getCountdownEvents();
  activeCountdownIndex = (index + events.length) % events.length;
  updateExamCountdown();
}
function updateExamCountdown() {
  const el = document.getElementById('exam-countdown-value');
  const card = document.getElementById('exam-countdown');
  if (!el || !card) return;

  const events = getCountdownEvents();
  if (!events.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  activeCountdownIndex = Math.min(activeCountdownIndex, events.length - 1);
  const event = events[activeCountdownIndex];
  const label = document.querySelector('.exam-countdown-label');
  const dateLabel = document.querySelector('.exam-countdown-date');
  if (label) label.textContent = event.name;
  if (dateLabel) dateLabel.textContent = formatCountdownEventDate(event);
  const dots = document.getElementById('exam-countdown-dots');
  if (dots) {
    if (events.length < 2) {
      dots.hidden = true;
      dots.innerHTML = '';
    } else {
      dots.hidden = false;
      dots.innerHTML = events
        .map(
          (_, index) =>
            `<span class="exam-countdown-dot${index === activeCountdownIndex ? ' active' : ''}"></span>`
        )
        .join('');
    }
  }
  const toDate = value => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  const examStart = toDate(event.startDate);
  const examEnd = toDate(event.endDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffStart = Math.round((examStart - today) / 86400000);
  const diffEnd = Math.round((examEnd - today) / 86400000);
  const isSingleDay = event.startDate === event.endDate;

  if (diffStart > 0) {
    el.innerHTML = `${diffStart}<span class="exam-countdown-unit">天</span>`;
    card.setAttribute('aria-label', `${event.name}倒數 ${diffStart} 天`);
  } else if (isSingleDay && diffStart === 0) {
    el.textContent = '今天';
    card.setAttribute('aria-label', `${event.name}今天開始`);
  } else if (diffEnd >= 0) {
    el.textContent = '進行中';
    card.setAttribute('aria-label', `${event.name}進行中`);
  } else {
    el.textContent = '已結束';
    card.setAttribute('aria-label', `${event.name}已結束`);
  }
}

const countdownCard = document.getElementById('exam-countdown');
let countdownSwipeStartX = null;
if (countdownCard) {
  countdownCard.addEventListener('pointerdown', event => {
    countdownSwipeStartX = event.clientX;
    countdownCard.setPointerCapture(event.pointerId);
  });
  countdownCard.addEventListener('pointerup', event => {
    if (countdownSwipeStartX === null) return;
    const distance = event.clientX - countdownSwipeStartX;
    countdownSwipeStartX = null;
    if (Math.abs(distance) < 35 || getCountdownEvents().length < 2) return;
    showCountdownEvent(activeCountdownIndex + (distance < 0 ? 1 : -1));
  });
  countdownCard.addEventListener('pointercancel', () => (countdownSwipeStartX = null));
}

// Recomputes the current class, next class, timer, and visible schedule state.
// DOM nodes update()/render() touch every tick, queried once instead of via
// getElementById/querySelector on every single call (previously ~20 lookups
// a second even while nothing on screen was changing).
let dashboardDom = null;
function getDashboardDom() {
  if (dashboardDom) return dashboardDom;
  dashboardDom = {
    simStatus: document.getElementById('sim-status'),
    weekDisplay: document.getElementById('week-display-main'),
    dot: document.getElementById('dot'),
    progressWrap: document.getElementById('progress-wrap'),
    progressBar: document.getElementById('progress-bar'),
    timerGroup: document.getElementById('timer-group'),
    timerLabel: document.querySelector('.timer-label'),
    timerVal: document.getElementById('timer-val'),
    nowName: document.getElementById('now-name'),
    nowStack: document.querySelector('.now-stack'),
    dashboard: document.querySelector('.dashboard'),
    nowTeacher: document.getElementById('now-teacher'),
    nowPlace: document.getElementById('now-place'),
    nowClassLabel: document.getElementById('now-class-label'),
    metaRow: document.querySelector('.now-meta-row'),
    nextName: document.getElementById('next-name'),
    nextMetaText: document.getElementById('next-meta-text')
  };
  return dashboardDom;
}

// Applies a schedule-calc view-model (see computeDashboardViewModel) to the
// DOM. Pure data in, DOM writes out - no scheduling logic lives here.
function renderDashboard(viewModel, week) {
  const dom = getDashboardDom();

  dom.weekDisplay.innerHTML = getWeekLabelHtml(week);

  dom.dot.className =
    viewModel.dotState === 'active'
      ? 'status-dot status-active'
      : viewModel.dotState === 'wait'
        ? 'status-dot status-wait'
        : 'status-dot';

  dom.timerGroup.style.display = viewModel.timerVisible ? 'flex' : 'none';
  if (viewModel.timerVisible) {
    dom.timerLabel.innerText = viewModel.timerLabel;
    dom.timerVal.innerText = viewModel.timerValue;
  }

  dom.progressWrap.style.display = viewModel.progressVisible ? 'block' : 'none';
  if (viewModel.progressVisible) {
    dom.progressBar.classList.toggle('is-class', viewModel.progressIsClass);
    dom.progressBar.style.width = viewModel.progressPercent + '%';
  }

  dom.nowName.innerText = viewModel.statusText;
  if (dom.dashboard) {
    dom.dashboard.style.setProperty(
      '--current-class-color',
      getClassColor(viewModel.activeClassKey || viewModel.upcomingClassKey || '')
    );
  }
  dom.nowName.classList.toggle('is-status', viewModel.compactStatus);
  if (dom.nowStack) dom.nowStack.classList.toggle('is-status', viewModel.compactStatus);
  dom.nowTeacher.innerText = viewModel.teacherText || '';
  dom.nowTeacher.classList.toggle('show', !!viewModel.teacherText);
  dom.nowPlace.innerText = viewModel.placeText || '';
  dom.nowPlace.classList.toggle('show', !!viewModel.placeText);
  if (dom.nowClassLabel) {
    dom.nowClassLabel.innerHTML = viewModel.classLabel || '';
    dom.nowClassLabel.classList.toggle('show', !!viewModel.classLabel);
  }
  if (dom.metaRow) dom.metaRow.style.display = viewModel.metaRowVisible ? 'flex' : 'none';
  fitNowTitleText();
  dom.nextName.innerText = viewModel.nextText;
  dom.nextMetaText.innerText = viewModel.nextMeta;
}

function update() {
  updateExamCountdown();
  const dom = getDashboardDom();
  let now = new Date();
  if (window.MANUALLY_TEST) {
    const h = Math.floor((window.TEST_TIME_SEC || 0) / 3600),
      m = Math.floor(((window.TEST_TIME_SEC || 0) % 3600) / 60),
      s = (window.TEST_TIME_SEC || 0) % 60;
    now.setHours(h, m, s, 0);
    if (dom.simStatus)
      dom.simStatus.innerText = window.IS_SIMULATING ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : '';
  } else if (dom.simStatus) {
    dom.simStatus.innerText = '';
  }
  const curDay = window.MANUALLY_TEST ? window.TEST_DAY : now.getDay();
  const week = getWeekType();

  const viewModel = computeDashboardViewModel({
    now,
    curDay,
    week,
    todaySchedule: state.runtimeSchedule[curDay],
    breakTimes: state.applicationData.breakTimes
  });

  if (!viewModel.isDayFinished && state.autoAdvancedAfterFinishedDay === curDay) {
    state.autoAdvancedAfterFinishedDay = null;
  }
  if (
    viewModel.isDayFinished &&
    state.viewDay === curDay &&
    state.autoAdvancedAfterFinishedDay !== curDay
  ) {
    state.viewDay = getNextSchoolDay(curDay);
    state.autoAdvancedAfterFinishedDay = curDay;
  }

  renderDashboard(viewModel, week);

  const liveStateKey = `${window.MANUALLY_TEST ? 'T' : 'R'}-${curDay}-${week}-${viewModel.curIdx}-${viewModel.nxtIdx}-${viewModel.activeBreakName}-${viewModel.isDayFinished}-${state.viewDay}`;
  if (state.lastListKey !== liveStateKey) {
    renderList(week, viewModel.curIdx, viewModel.nxtIdx, curDay, viewModel.isDayFinished);
    state.lastListKey = liveStateKey;
  }
}

// Set the instant the user touches or scrolls the list (see initScheduleScrollInputTracking),
// not only once a 'scroll' event actually lands. A pending one-time alignment (below) checks
// this and backs off instead of yanking the list out from under an in-progress gesture.

function keepActiveClassVisible(list, isDayFinished, scrollKey) {
  if (scrollKey === state.lastAutoScrollKey) return;
  state.lastAutoScrollKey = scrollKey;
  state.userScrolledDuringAlign = false;

  const activeRow = list.querySelector('.is-now') || list.querySelector('.is-next');

  if (isDayFinished || !activeRow) {
    requestAnimationFrame(() =>
      list.scrollTo({
        top: 0,
        behavior: 'auto'
      })
    );
    return;
  }

  // One pass, one frame after layout: the row entrance animation only transforms
  // opacity/transform/filter (never layout-affecting properties), so activeRow.offsetTop
  // is already correct here and doesn't need to be re-polled on a timer afterwards.
  requestAnimationFrame(() => {
    if (state.userScrolledDuringAlign) return;
    // Clamped to the list's own natural scroll bound — this never manufactures extra
    // scrollable room to force exact top-alignment for a class near the end of a long
    // day. That used to need a second system to stop manual scrolling drifting into the
    // manufactured room, which meant fighting iOS Safari's native rubber-band bounce at
    // the bottom edge and reading as flicker. A class within the last screenful now
    // settles as high as native scrolling allows instead of exactly at the top; nothing
    // here ever imposes a ceiling tighter than the browser's own, so there is nothing
    // left to contest during a touch gesture.
    const targetTop = Math.min(Math.max(0, activeRow.offsetTop), getNaturalListMaxScroll(list));
    list.scrollTo({ top: targetTop, behavior: 'auto' });
  });
}

// Real content boundary for scrolling.
function getNaturalListMaxScroll(list) {
  return Math.max(0, list.scrollHeight - list.clientHeight);
}

// Closes the class detail modal.
function setElementVisible(id, visible) {
  const element = document.getElementById(id);
  if (element) element.classList.toggle('show', visible);
  return element;
}
function setOverlayVisible(overlayId, panelId, visible, bodyClass) {
  const overlay = setElementVisible(overlayId, visible);
  setElementVisible(panelId, visible);
  if (overlay) overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (bodyClass) document.body.classList.toggle(bodyClass, visible);
}
function closeModal() {
  setOverlayVisible('overlay', 'sheet', false, 'modal-open');
  if (modalPreviousFocus && typeof modalPreviousFocus.focus === 'function')
    modalPreviousFocus.focus();
  modalPreviousFocus = null;
}
function setSplitWeekClass(id, subject, teacher) {
  const target = document.getElementById(id);
  if (!target) return;
  target.replaceChildren(document.createTextNode(subject || ''));
  const teacherText = document.createElement('div');
  teacherText.style.cssText = 'font-size:11px;font-weight:400;color:var(--sub)';
  teacherText.textContent = teacher || '';
  target.appendChild(teacherText);
}
// Opens the class detail modal and fills in occurrence/location details.
function openModal(c) {
  modalPreviousFocus = document.activeElement;
  const week = getWeekType();
  const terms = c.isSplit ? c.n.split('/').map(t => t.trim()) : [c.n];
  const teachers = c.isSplit ? c.t.split('/').map(t => t.trim()) : [c.t];
  let count = 0,
    occHtml = '';
  const locCard = document.getElementById('m-location-card');
  const statGrid = locCard.closest('.stat-grid');
  if (c.loc) {
    locCard.style.display = 'block';
    document.getElementById('m-location-val').innerText = c.loc;
    statGrid.classList.add('has-location');
  } else {
    locCard.style.display = 'none';
    statGrid.classList.remove('has-location');
  }
  [1, 2, 3, 4, 5].forEach(d => {
    state.runtimeSchedule[d].forEach((item, idx) => {
      const match = c.isSplit ? terms.some(t => item.n.includes(t)) : item.n === c.n;
      if (match) {
        count++;
        occHtml += `<div class="occ-row"><span class="occ-row-day">週${dayNames[d]}</span><div class="occ-row-meta"><div class="occ-row-period">第 ${idx + 1} 節</div><div class="occ-row-time">${esc(item.s)} – ${esc(item.e)}</div></div></div>`;
      }
    });
  });
  const sc = document.getElementById('split-info-card');
  if (c.isSplit) {
    sc.style.display = 'block';
    const idx = week === '單' ? 0 : 1;
    setSplitWeekClass('this-week-class', terms[idx], teachers[idx] || teachers[0]);
    setSplitWeekClass('next-week-class', terms[1 - idx], teachers[1 - idx] || teachers[0]);
    document.getElementById('m-type-val').innerText = '雙週';
  } else {
    sc.style.display = 'none';
    document.getElementById('m-type-val').innerText = '固定';
  }
  const info = processSplitName(c, week);
  document.getElementById('m-title').innerText = info.n;
  document.getElementById('m-teacher').innerText = '教師　' + info.t;
  document.getElementById('m-count').innerText = count + ' 節';
  document.getElementById('m-occ-list').innerHTML =
    occHtml ||
    `<div class="occ-row"><span class="occ-row-day">×</span><div class="occ-row-meta"><div class="occ-row-period">無排課</div></div></div>`;
  setOverlayVisible('overlay', 'sheet', true, 'modal-open');
}

// Exposed on window for inline HTML event handlers (onclick="..." in
// index.html and in generated template strings).
window.closeModal = closeModal;
window.closeTestPanel = closeTestPanel;
window.handleNav = handleNav;
window.toggleActionMenu = toggleActionMenu;
window.toggleTestPanel = toggleTestPanel;
window.update = update; // testsim-runtime.js monkey-patches this; every
// cross-module caller goes through window.update() to see that patch.

export {
  closeTestPanel,
  getCountdownEvents,
  handleNav,
  keepActiveClassVisible,
  openModal,
  openTestPanel,
  setOverlayVisible,
  syncTestToolbar,
  toggleTestPanel
};
