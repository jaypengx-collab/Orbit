// ---- src/dashboard-render.js ----
// DOM rendering for the schedule list (not the live "now" card - that's
// dashboard.js) and viewport-driven layout fitting (title sizing, accordion).
import { state } from './state.js';
import { normalizeProAccent } from './appearance.js';
import { keepActiveClassVisible, openModal } from './dashboard.js';
import { openEditorFold } from './editor-core.js';
import { getNextSchoolDay, processSplitName } from './schedule.js';

// Updates the simulation play/pause button and indicator. (Simulator controls
// change the displayed clock only - never the saved schedule data.)
function syncTestPlayPauseUi() {
  const btn = document.getElementById('test-play-pause-btn');
  const indicator = document.getElementById('sim-indicator');
  const exitButton = document.getElementById('test-exit-btn');

  if (!btn || !indicator) return;

  if (!window.MANUALLY_TEST) {
    btn.textContent = '開始';
    btn.classList.remove('active');
    indicator.style.display = 'none';

    if (exitButton) {
      exitButton.disabled = false;
      exitButton.style.opacity = '1';
    }
  } else if (window.IS_SIMULATING) {
    btn.textContent = '暫停';
    btn.classList.add('active');
    indicator.style.display = 'inline-flex';

    if (exitButton) {
      exitButton.disabled = false;
      exitButton.style.opacity = '1';
    }
  } else {
    btn.textContent = '繼續';
    btn.classList.remove('active');
    indicator.style.display = 'none';

    if (exitButton) {
      exitButton.disabled = false;
      exitButton.style.opacity = '1';
    }
  }
}

// Keeps only one editor accordion section open at a time.
(function initEditorAccordion() {
  const sheet = document.getElementById('editor-sheet');

  if (!sheet) return;

  sheet.querySelectorAll('details.editor-fold').forEach(det => {
    const summary = det.querySelector('.editor-fold-summary');

    if (summary) {
      summary.addEventListener('click', event => {
        if (!sheet.classList.contains('is-layered')) return;

        // In layered mode, the active layer should stay open.
        // Prevent the native <details> close/reopen flash.
        if (det.classList.contains('active')) {
          event.preventDefault();
        }
      });
    }

    det.addEventListener('toggle', () => {
      if (sheet.classList.contains('is-layered')) {
        if (det.open && !det.classList.contains('active')) openEditorFold(det.id);
        else if (!det.open && det.classList.contains('active')) det.open = true;
        return;
      }
      if (!det.open) return;

      sheet.querySelectorAll('details.editor-fold').forEach(other => {
        if (other !== det) other.open = false;
      });
    });
  });
})();
// Marks real user input the instant it starts, not only once a 'scroll' event eventually
// fires — see the comment on keepActiveClassVisible. There is no manual-scroll correction
// here at all: the list's scrollable bounds are always the browser's own native bounds, so
// there is nothing for this code to enforce beyond what iOS/desktop scrolling already does.
(function initScheduleScrollInputTracking() {
  const list = document.getElementById('schedule-list');

  if (!list) return;

  ['pointerdown', 'touchstart', 'wheel'].forEach(type => {
    list.addEventListener(
      type,
      () => {
        state.userScrolledDuringAlign = true;
      },
      { passive: true }
    );
  });
})();

// Press feedback for the class cards: a live, held-state size change, not a
// canned one-shot animation - grows the instant the finger touches down
// (.is-pressed), eases back the instant it lifts, tracking the actual press
// in real time exactly the way the day-nav buttons' own :active does (see
// .nav-item in styles.css). A separate fixed-length "replay the tap"
// animation was tried here first (triggered on the 'click' event, i.e.
// necessarily after the finger had already lifted) and it was never going
// to feel immediate no matter how short it ran, because it always started
// after the physical gesture was already over rather than during it - a
// structural lag a shorter duration can't fix.
//
// Still JS-driven rather than a bare CSS :active rule: on iOS Safari
// specifically, :active on an element with a backdrop-filter has a history
// of failing to composite in time for a tap this quick (see .nav-item's own
// comment on the same issue) - .is-pressed, held for exactly as long as the
// finger is actually down, is the reliable version of the same state.
//
// One delegated listener rather than per-row ones: renderList() rebuilds
// every card from scratch on each update, so anything bound to a row would
// have to be re-bound several times a minute.
(function initSchedulePressFeedback() {
  const list = document.getElementById('schedule-list');

  if (!list) return;

  let pressedRow = null;
  const release = () => {
    if (!pressedRow) return;
    pressedRow.classList.remove('is-pressed');
    pressedRow = null;
  };

  list.addEventListener(
    'pointerdown',
    event => {
      const row = event.target instanceof Element ? event.target.closest('.row') : null;
      if (!row) return;
      release();
      pressedRow = row;
      row.classList.add('is-pressed');
    },
    { passive: true }
  );
  // Released on anything that ends the press, including ones that never
  // reach the list itself: a finger lifted after dragging off the card, a
  // scroll turning the touch into a pan (pointercancel), or the sheet the
  // tap opened stealing the pointer.
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type =>
    window.addEventListener(type, release, { passive: true })
  );
  list.addEventListener('scroll', release, { passive: true });
})();

/* Dashboard sizing and accessible list rendering. */
// Shrinks el's font-size (assumed already single-line/nowrap with visible
// overflow) to fit within `available` px, binary-searching between minSize
// and defaultSize; leaves it at defaultSize if that already fits. Shared by
// fitNowTitleText (the "now playing" title) and dashboard.js's countdown
// event name fit.
function shrinkFontToFit(el, available, defaultSize, minSize) {
  el.style.fontSize = defaultSize + 'px';
  if (el.scrollWidth <= available + 1) return;
  let lo = minSize,
    hi = defaultSize,
    best = minSize;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.scrollWidth <= available + 1) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  el.style.fontSize = Math.floor(best) + 'px';
}
const titleFitState = { key: '', raf: 0 };
function fitNowTitleText(force = false) {
  const title = document.getElementById('now-name');
  const stack = document.querySelector('.now-stack');
  const meta = document.querySelector('.now-meta-row');
  if (!title || !stack) return;

  const raw = (title.textContent || '').trim();
  const isStatus = stack.classList.contains('is-status');
  const hasLatin = /[A-Za-z]/.test(raw);
  const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  const defaultSize = vw <= 430 ? (isStatus ? 48 : 48) : isStatus ? 46 : 46;
  const minSize = hasLatin ? 18 : 22;
  const stackWidth = Math.round(stack.getBoundingClientRect().width);
  const metaText = meta ? (meta.textContent || '').trim() : '';
  const metaDisplay = meta ? getComputedStyle(meta).display : '';
  const key = [
    raw,
    isStatus ? 'status' : 'class',
    stackWidth,
    metaText,
    metaDisplay,
    vw <= 430 ? 'm' : 'w'
  ].join('|');
  if (!force && titleFitState.key === key) return;
  titleFitState.key = key;
  if (titleFitState.raf) cancelAnimationFrame(titleFitState.raf);

  titleFitState.raf = requestAnimationFrame(() => {
    const styles = getComputedStyle(stack);
    const paddingX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const gap = parseFloat(styles.columnGap || styles.gap) || 0;
    const metaVisible = meta && getComputedStyle(meta).display !== 'none';
    const metaWidth = metaVisible ? Math.ceil(meta.getBoundingClientRect().width) : 0;
    const available = Math.max(
      72,
      Math.floor(stack.clientWidth - paddingX - (metaWidth ? metaWidth + gap : 0))
    );

    title.style.whiteSpace = 'nowrap';
    title.style.wordBreak = 'keep-all';
    title.style.overflowWrap = 'normal';
    title.style.textOverflow = 'clip';
    title.style.overflow = 'visible';
    title.style.lineHeight = '.98';
    title.style.letterSpacing = hasLatin ? '-.95px' : '-.8px';
    title.style.width = available + 'px';
    title.style.maxWidth = available + 'px';
    shrinkFontToFit(title, available, defaultSize, minSize);
  });
}
// A single line reads better than two, so try shrinking the "10:10 · 徐蓉莉
// · 第三會議室" line to fit before ever wrapping it - only fall back to a
// real (balanced, keep-all) two-line wrap when even the smallest legible
// size still can't fit it, so long teacher/room names never get clipped or
// shrunk into illegibility.
const nextMetaFitState = { key: '', raf: 0 };
function fitNextMetaText(force = false) {
  const el = document.getElementById('next-meta-text');
  if (!el) return;
  const raw = (el.textContent || '').trim();
  if (!raw) return;
  const key = raw + '|' + Math.round(el.parentElement?.getBoundingClientRect().width || 0);
  if (!force && nextMetaFitState.key === key) return;
  nextMetaFitState.key = key;
  if (nextMetaFitState.raf) cancelAnimationFrame(nextMetaFitState.raf);

  nextMetaFitState.raf = requestAnimationFrame(() => {
    el.classList.remove('wrap-2l');
    el.style.fontSize = '';
    const defaultSize = parseFloat(getComputedStyle(el).fontSize) || 15;
    const minSize = Math.max(9, Math.round(defaultSize * 0.62));
    const available = Math.floor(el.clientWidth);
    if (!available) return;
    shrinkFontToFit(el, available, defaultSize, minSize);
    if (el.scrollWidth > available + 1) {
      el.style.fontSize = defaultSize + 'px';
      el.classList.add('wrap-2l');
    }
  });
}
function createMetaChip(text, cls = '') {
  const span = document.createElement('span');
  span.className = 'meta-chip ' + cls;
  span.textContent = text;
  return span;
}
function getClassColor() {
  const draftPanel = document.getElementById('style-panel');
  const activeStyle =
    state.stylePanelDraft && draftPanel?.classList.contains('style-draft-dirty')
      ? state.stylePanelDraft
      : state.applicationData;
  return normalizeProAccent(activeStyle.proAccent);
}
function renderList(week, curIdx, nxtIdx, curDay, isDayFinished) {
  const list = document.getElementById('schedule-list');
  if (!list) return;
  list.classList.remove('animate-list');
  void list.offsetWidth;
  list.classList.add('animate-list');
  const tomorrow = getNextSchoolDay(curDay);
  document.querySelectorAll('.nav-item').forEach(btn => {
    const day = parseInt(btn.dataset.day, 10);
    btn.classList.toggle('active', day === state.viewDay);
    btn.classList.toggle('is-today', day === curDay);
    btn.classList.toggle('is-tomorrow', isDayFinished && day === tomorrow);
  });

  list.innerHTML = '';
  const rows = state.runtimeSchedule[state.viewDay] || [];
  rows.forEach((c, i) => {
    const isToday = state.viewDay === (window.MANUALLY_TEST ? window.TEST_DAY : curDay);
    const info = processSplitName(c, week);
    const isNow = isToday && i === curIdx;
    const isNext = isToday && i === nxtIdx;
    const row = document.createElement('div');
    row.className = `row ${isNow ? 'is-now' : ''} ${isNext ? 'is-next' : ''}`.trim();
    row.style.setProperty('--row-i', String(i));
    row.tabIndex = 0;
    row.role = 'button';
    row.addEventListener('click', () => openModal(c));
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(c);
      }
    });

    const badge = document.createElement('div');
    badge.className = 'period-badge';
    badge.textContent = String(i + 1);
    const content = document.createElement('div');
    content.className = 'content';
    const name = document.createElement('div');
    name.className = 'row-name';
    const nameText = document.createElement('span');
    nameText.className = 'row-name-text';
    nameText.textContent = info.n;
    name.append(nameText);
    if (info.label) {
      const labelWrap = document.createElement('span');
      labelWrap.className = 'row-name-week-label';
      labelWrap.innerHTML = info.label;
      name.append(labelWrap);
    }
    if (isNow || isNext) {
      const tag = document.createElement('span');
      tag.className = 'status-tag';
      tag.textContent = isNow ? '進行中' : '下一節';
      name.append(tag);
    }
    const meta = document.createElement('div');
    meta.className = 'row-meta';
    meta.append(createMetaChip(`${c.s} – ${c.e}`, 'meta-time'));
    if (info.t) meta.append(createMetaChip(info.t, 'meta-teacher'));
    if (c.loc) meta.append(createMetaChip(c.loc, 'meta-location'));
    content.append(name, meta);
    row.append(badge, content);
    list.appendChild(row);
  });
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'row';
    empty.innerHTML =
      '<div class="period-badge">×</div><div class="content"><div class="row-name">這天沒有課</div><div class="row-meta"><span class="meta-chip">可以休息或安排自習</span></div></div>';
    list.appendChild(empty);
  }
  keepActiveClassVisible(
    list,
    isDayFinished,
    `${state.viewDay}-${curIdx}-${nxtIdx}-${isDayFinished}`
  );
}
window.addEventListener('resize', () => {
  fitNowTitleText(true);
  fitNextMetaText(true);
});
window.addEventListener('orientationchange', () =>
  setTimeout(() => {
    fitNowTitleText(true);
    fitNextMetaText(true);
  }, 120)
);
window.addEventListener('load', () => {
  fitNowTitleText(true);
  fitNextMetaText(true);
});

/* Test mode advances from one clock tick; the consolidated controller handles input changes. */
function mainClockTick() {
  if (window.MANUALLY_TEST && window.IS_SIMULATING) {
    window.TEST_TIME_SEC = ((window.TEST_TIME_SEC || 0) + 1) % 86400;
    const slider = document.getElementById('test-time-slider');
    if (slider) slider.value = Math.floor(window.TEST_TIME_SEC / 60);
  }
  window.update();
}

export {
  fitNextMetaText,
  fitNowTitleText,
  getClassColor,
  mainClockTick,
  renderList,
  shrinkFontToFit,
  syncTestPlayPauseUi
};
