// ---- src/testsim-runtime.js ----
import { state } from './state.js';
import { closeTestPanel, syncTestToolbar } from './dashboard.js';
import { syncTestPlayPauseUi } from './dashboard-render.js';
import { ORBIT_INITIAL_MARKUP } from './data.js';
import { parseTime } from './schedule.js';

// ---- js/testsim-runtime.js ----
(function () {
  var END_OF_DAY_MINUTES = 24 * 60;
  var END_OF_DAY_SECONDS = 24 * 3600;
  var START_LEAD_SECONDS = 5;
  var DAY_START_SECONDS = 8 * 3600;
  var lastSimSecond = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : null;
  var endOfDayArmed = false;
  var pausedAtManualRollover = false;
  var savedPausedSecond = null;
  var savedPausedDay = null;
  var sliderEndpointLock = false;
  var lastTestingState = !!(window.MANUALLY_TEST || window.IS_SIMULATING);
  var updatePatched = false;
  var panelPatched = false;
  var defaultsInitialized = false;
  var TEST_STATE_STORAGE_KEY = 'orbitTestState';

  // Discovered from the DOM rather than hardcoded, since the build now
  // bundles src/*.js into a single content-hashed asset (its filename
  // changes on every deploy) - reading the actual <script>/<link> the page
  // loaded is the only way to name "the app's own assets" that stays
  // correct in both `vite dev` (unbundled) and the built site.
  function getVersionedAssetUrls() {
    var urls = [];
    var script = document.querySelector('script[type="module"][src]');
    if (script) urls.push(script.src);
    var stylesheet = document.querySelector('link[rel="stylesheet"][href]');
    if (stylesheet) urls.push(stylesheet.href);
    return urls;
  }
  // Fetched with fetch() (async) rather than a synchronous XMLHttpRequest so computing
  // the version hash never blocks page boot — it used to freeze rendering for as long as
  // it took to re-download every source file over the network on every single page load.
  function fetchTextAsync(url) {
    var bustedUrl =
      url + (url.indexOf('?') === -1 ? '?' : '&') + '_v=' + Date.now() + Math.random();
    return fetch(bustedUrl, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Unable to fetch ' + url);
      return response.text();
    });
  }
  function el(id) {
    return document.getElementById(id);
  }
  function getAppVersionAsync() {
    var url = window.location.href.replace(/[?#].*$/, '');
    return Promise.all([fetchTextAsync(url)].concat(getVersionedAssetUrls().map(fetchTextAsync)))
      .then(function (parts) {
        return parts.join('');
      })
      .catch(function () {
        return ORBIT_INITIAL_MARKUP;
      })
      .then(function (source) {
        source = source.replace(/(<span id="app-version"[^>]*>)[\s\S]*?(<\/span>)/, '$1$2');
        var hash = 2166136261;
        for (var i = 0; i < source.length; i++) {
          hash ^= source.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36).toUpperCase();
      });
  }
  function syncAppVersion() {
    var version = el('app-version');
    if (!version) return;
    getAppVersionAsync()
      .then(function (hash) {
        version.textContent = '版本 ' + hash;
      })
      .catch(function () {
        version.textContent = '版本 未知';
      });
  }
  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, n));
  }
  function normalizeDay(day) {
    var n = parseInt(day, 10);
    if (!Number.isFinite(n)) n = new Date().getDay();
    return ((n % 7) + 7) % 7;
  }
  function normalizeSeconds(seconds) {
    var n = Math.round(Number(seconds));
    if (!Number.isFinite(n)) n = DAY_START_SECONDS;
    return ((n % END_OF_DAY_SECONDS) + END_OF_DAY_SECONDS) % END_OF_DAY_SECONDS;
  }
  function selectedDay() {
    return normalizeDay(el('test-day-input') && el('test-day-input').value);
  }
  function resetRenderState() {
    if (typeof state.viewDay !== 'undefined') state.viewDay = window.TEST_DAY;
    if (typeof state.autoAdvancedAfterFinishedDay !== 'undefined')
      state.autoAdvancedAfterFinishedDay = null;
    if (typeof state.lastListKey !== 'undefined') state.lastListKey = '';
    if (typeof state.lastAutoScrollKey !== 'undefined') state.lastAutoScrollKey = '';
  }
  function writeDay(day) {
    window.TEST_DAY = normalizeDay(day);
    var dayInput = el('test-day-input');
    if (dayInput) dayInput.value = String(window.TEST_DAY);
    resetRenderState();
  }
  function persistTestState() {
    try {
      if (!window.MANUALLY_TEST) {
        localStorage.removeItem(TEST_STATE_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        TEST_STATE_STORAGE_KEY,
        JSON.stringify({
          day: normalizeDay(window.TEST_DAY),
          seconds: Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : DAY_START_SECONDS,
          simulating: !!window.IS_SIMULATING,
          endOfDayArmed: !!endOfDayArmed,
          pausedAtManualRollover: !!pausedAtManualRollover,
          savedPausedSecond: Number.isFinite(savedPausedSecond) ? savedPausedSecond : null,
          savedPausedDay: Number.isFinite(savedPausedDay) ? savedPausedDay : null
        })
      );
    } catch (error) {
      console.warn('Unable to persist test mode state.', error);
    }
  }
  function restoreTestState() {
    try {
      const raw = localStorage.getItem(TEST_STATE_STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (
        !state ||
        typeof state !== 'object' ||
        typeof state.day !== 'number' ||
        typeof state.seconds !== 'number'
      ) {
        localStorage.removeItem(TEST_STATE_STORAGE_KEY);
        return false;
      }
      window.MANUALLY_TEST = true;
      window.TEST_DAY = normalizeDay(state.day);
      window.TEST_TIME_SEC = Math.max(0, Math.min(END_OF_DAY_SECONDS, Math.round(state.seconds)));
      window.IS_SIMULATING = state.simulating === true;
      endOfDayArmed = state.endOfDayArmed === true;
      pausedAtManualRollover = state.pausedAtManualRollover === true;
      savedPausedSecond = Number.isFinite(state.savedPausedSecond) ? state.savedPausedSecond : null;
      savedPausedDay = Number.isFinite(state.savedPausedDay)
        ? normalizeDay(state.savedPausedDay)
        : null;
      writeDay(window.TEST_DAY);
      return true;
    } catch (error) {
      console.warn('Unable to restore test mode state.', error);
      localStorage.removeItem(TEST_STATE_STORAGE_KEY);
      return false;
    }
  }
  function unlockTestControls() {
    var slider = el('test-time-slider');
    var hour = el('in-h');
    var minute = el('in-m');
    if (slider) {
      slider.min = '0';
      slider.max = String(END_OF_DAY_MINUTES);
      slider.step = '1';
    }
    if (hour) {
      hour.min = '0';
      hour.max = '24';
    }
    if (minute) {
      minute.min = '0';
      minute.max = '59';
    }
  }
  function setStartOfDayInputs() {
    endOfDayArmed = false;
    var h = el('in-h');
    var m = el('in-m');
    var slider = el('test-time-slider');
    if (h) h.value = '0';
    if (m) m.value = '0';
    if (slider) slider.value = '0';
  }
  function setEndOfDayInputs() {
    endOfDayArmed = true;
    pausedAtManualRollover = false;
    var h = el('in-h');
    var m = el('in-m');
    var slider = el('test-time-slider');
    if (h) h.value = '24';
    if (m) m.value = '0';
    if (slider) slider.value = String(END_OF_DAY_MINUTES);
  }
  function forceStartOfDayInputs() {
    setStartOfDayInputs();
    requestAnimationFrame(function () {
      setStartOfDayInputs();
      setTimeout(setStartOfDayInputs, 0);
      setTimeout(setStartOfDayInputs, 50);
    });
  }
  function clearSavedPausedTime() {
    savedPausedSecond = null;
    savedPausedDay = null;
  }
  function clearSliderEndpointLock() {
    sliderEndpointLock = false;
  }
  function getTypedTargetSeconds() {
    var h = parseInt((el('in-h') || {}).value, 10);
    var m = parseInt((el('in-m') || {}).value, 10);
    if (!Number.isFinite(h)) h = 8;
    if (!Number.isFinite(m)) m = 0;
    if (h >= 24) return END_OF_DAY_SECONDS;
    return Math.max(0, Math.min(23, h)) * 3600 + Math.max(0, Math.min(59, m)) * 60;
  }
  function selectedTargetSeconds() {
    if (
      pausedAtManualRollover &&
      !window.IS_SIMULATING &&
      Number.isFinite(window.TEST_TIME_SEC) &&
      window.TEST_TIME_SEC < START_LEAD_SECONDS
    )
      return window.TEST_TIME_SEC;
    var slider = el('test-time-slider');
    if (endOfDayArmed || (slider && parseInt(slider.value, 10) >= END_OF_DAY_MINUTES))
      return END_OF_DAY_SECONDS;
    return getTypedTargetSeconds();
  }
  function setSimSeconds(seconds, opts) {
    opts = opts || {};
    unlockTestControls();
    window.TEST_TIME_SEC = normalizeSeconds(seconds);
    if (opts.writeInputs !== false) updateInputDisplay();
    if (opts.writeSlider !== false) {
      var slider = el('test-time-slider');
      if (slider) slider.value = String(Math.floor(window.TEST_TIME_SEC / 60));
    }
  }
  function syncTestChrome() {
    syncTestPlayPauseUi();
    enableExitButton();
    syncTestToolbar();
    syncTestingBody();
  }
  function refreshTestUi() {
    syncTestChrome();
    window.update();
    lastSimSecond = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : null;
  }
  function pauseForEditing() {
    if (window.MANUALLY_TEST || window.IS_SIMULATING) {
      window.MANUALLY_TEST = true;
      window.IS_SIMULATING = false;
      syncTestChrome();
    }
  }
  function setDefaultsToCurrentTime(force) {
    var now = new Date();
    var dayInput = el('test-day-input');
    var hourInput = el('in-h');
    var minInput = el('in-m');
    var slider = el('test-time-slider');
    if (!dayInput || !hourInput || !minInput || !slider) return;
    unlockTestControls();
    if (force || !window.MANUALLY_TEST) {
      window.TEST_DAY = now.getDay();
      window.TEST_TIME_SEC = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      dayInput.value = String(window.TEST_DAY);
      hourInput.value = now.getHours();
      minInput.value = now.getMinutes();
      slider.value = String(now.getHours() * 60 + now.getMinutes());
    }
  }
  function mergeNextClassWithTimer() {
    var timeCard = document.querySelector('.dashboard .time-card');
    var nextBox = document.querySelector('.dashboard > .next-box');
    if (!timeCard || !nextBox || timeCard.contains(nextBox)) return;
    timeCard.classList.add('v3-11-next-module');
    timeCard.appendChild(nextBox);
  }
  function patchPanelOpeners() {
    if (panelPatched) return;
    ['toggleTestPanel', 'openTestPanel'].forEach(function (name) {
      var original = window[name];
      window[name] = function () {
        if (!window.MANUALLY_TEST) setDefaultsToCurrentTime(true);
        var result = original.apply(this, arguments);
        setDefaultsToCurrentTime(false);
        // Only compute the version hash (re-fetches the page + its bundled
        // assets) when the panel that actually displays it is opened, not
        // on every page load - see the comment on syncAppVersion's removed
        // init()-time call for why that mattered.
        if (state.testPanelOpen) syncAppVersion();
        return result;
      };
    });
    panelPatched = true;
  }
  function syncCrossDayBeforeRender() {
    if (!window.MANUALLY_TEST || !window.IS_SIMULATING || !Number.isFinite(window.TEST_TIME_SEC)) {
      lastSimSecond = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : null;
      return;
    }
    var currentSecond = window.TEST_TIME_SEC;
    if (
      lastSimSecond !== null &&
      lastSimSecond >= END_OF_DAY_SECONDS - START_LEAD_SECONDS &&
      currentSecond < START_LEAD_SECONDS
    ) {
      writeDay(normalizeDay(window.TEST_DAY) + 1);
      endOfDayArmed = false;
      setStartOfDayInputs();
      syncTestChrome();
      currentSecond = 0;
    }
    lastSimSecond = currentSecond;
  }
  function getTestAwareNow() {
    var now = new Date();
    if (window.MANUALLY_TEST && Number.isFinite(window.TEST_TIME_SEC)) {
      now.setHours(Math.floor(window.TEST_TIME_SEC / 3600));
      now.setMinutes(Math.floor((window.TEST_TIME_SEC % 3600) / 60));
      now.setSeconds(Math.floor(window.TEST_TIME_SEC % 60));
      now.setMilliseconds(0);
    }
    return now;
  }
  function applyDashboardState() {
    var dashboard = document.querySelector('.dashboard');
    if (!dashboard || typeof state.runtimeSchedule === 'undefined') return;
    var now = getTestAwareNow();
    var curDay = window.MANUALLY_TEST ? normalizeDay(window.TEST_DAY) : now.getDay();
    var today = state.runtimeSchedule[curDay] || [];
    var firstClass = today[0];
    var lastClass = today[today.length - 1];
    var mins = now.getHours() * 60 + now.getMinutes();
    var hasParser = typeof parseTime === 'function';
    var finishedSchoolDay = !!(hasParser && lastClass && mins >= parseTime(lastClass.e));
    var outsideClassRange = !!(
      hasParser &&
      firstClass &&
      lastClass &&
      (mins < parseTime(firstClass.s) || mins >= parseTime(lastClass.e))
    );
    // True once nothing on today's schedule still starts after now, even mid-way through the
    // last class or its trailing break — not just once the whole day is over. Without this, the
    // dashboard kept showing an empty "next class" panel throughout the entire last period.
    var hasUpcomingClass = today.some(function (c) {
      return hasParser && parseTime(c.s) > mins;
    });
    var noUpcomingClass = !!(
      today.length &&
      !hasUpcomingClass &&
      !finishedSchoolDay &&
      !outsideClassRange
    );
    dashboard.classList.toggle('v3-15-day-finished', finishedSchoolDay);
    dashboard.classList.toggle('v3-16-outside-class-range', outsideClassRange);
    dashboard.classList.toggle('orbit-no-school-day', !today.length);
    dashboard.classList.toggle('orbit-no-upcoming-class', noUpcomingClass);
  }
  function syncTestingBody() {
    if (document.body)
      document.body.classList.toggle('testing', !!(window.MANUALLY_TEST || window.IS_SIMULATING));
  }
  function finishBoot() {
    if (document.body) document.body.classList.remove('orbit-booting');
  }
  function suppressListAnimationForThisFrame() {
    if (!document.body) return;
    document.body.classList.add('orbit-suppress-list-animation');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (document.body) document.body.classList.remove('orbit-suppress-list-animation');
      });
    });
  }
  function patchUpdate() {
    if (updatePatched || typeof window.update !== 'function') return;
    var originalUpdate = window.update;
    window.update = function () {
      var wasTesting = lastTestingState;
      var isTesting = !!(window.MANUALLY_TEST || window.IS_SIMULATING);
      if (wasTesting && !isTesting) suppressListAnimationForThisFrame();
      syncCrossDayBeforeRender();
      var result = originalUpdate.apply(this, arguments);
      if (
        endOfDayArmed &&
        window.MANUALLY_TEST &&
        window.IS_SIMULATING &&
        Number.isFinite(window.TEST_TIME_SEC) &&
        window.TEST_TIME_SEC >= END_OF_DAY_SECONDS - START_LEAD_SECONDS
      ) {
        setEndOfDayInputs();
      }
      if (
        pausedAtManualRollover &&
        window.MANUALLY_TEST &&
        !window.IS_SIMULATING &&
        Number.isFinite(window.TEST_TIME_SEC) &&
        window.TEST_TIME_SEC < START_LEAD_SECONDS
      ) {
        forceStartOfDayInputs();
      }
      if (window.MANUALLY_TEST && window.IS_SIMULATING && !endOfDayArmed) updateInputDisplay();
      applyDashboardState();
      syncTestingBody();
      lastTestingState = !!(window.MANUALLY_TEST || window.IS_SIMULATING);
      persistTestState();
      finishBoot();
      return result;
    };
    updatePatched = true;
  }
  function enableExitButton() {
    var exit = el('test-exit-btn');
    if (!exit) return;
    exit.disabled = false;
    exit.removeAttribute('disabled');
    exit.style.opacity = '1';
  }
  window.updateInputDisplay = function () {
    unlockTestControls();
    var hEl = el('in-h');
    var mEl = el('in-m');
    var active = document.activeElement;
    if (active === hEl || active === mEl) return;
    var seconds = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : DAY_START_SECONDS;
    if (seconds >= END_OF_DAY_SECONDS) {
      if (hEl) hEl.value = '24';
      if (mEl) mEl.value = '0';
      return;
    }
    seconds = normalizeSeconds(seconds);
    if (hEl) hEl.value = String(Math.floor(seconds / 3600));
    if (mEl) mEl.value = String(Math.floor((seconds % 3600) / 60));
  };

  window.syncTestFromSlider = function () {
    unlockTestControls();
    var slider = el('test-time-slider');
    var sliderMinute = slider ? parseInt(slider.value, 10) : 0;
    if (sliderEndpointLock) {
      if (sliderMinute < END_OF_DAY_MINUTES - 1) {
        sliderEndpointLock = false;
      } else {
        forceStartOfDayInputs();
        return;
      }
    }
    if (slider && sliderMinute >= END_OF_DAY_MINUTES - 1) {
      clearSavedPausedTime();
      var wasRunning = !!(window.MANUALLY_TEST && window.IS_SIMULATING);
      window.TEST_DAY = selectedDay();
      if (wasRunning) {
        sliderEndpointLock = true;
        writeDay(window.TEST_DAY + 1);
        window.MANUALLY_TEST = true;
        window.IS_SIMULATING = false;
        window.TEST_TIME_SEC = 0;
        forceStartOfDayInputs();
        pausedAtManualRollover = true;
      } else {
        window.TEST_TIME_SEC = END_OF_DAY_SECONDS;
        setEndOfDayInputs();
      }
      refreshTestUi();
      if (wasRunning) forceStartOfDayInputs();
      return;
    }
    clearSavedPausedTime();
    sliderEndpointLock = false;
    endOfDayArmed = false;
    pausedAtManualRollover = false;
    pauseForEditing();
    window.TEST_DAY = selectedDay();
    setSimSeconds(clampInt(slider && slider.value, 0, END_OF_DAY_MINUTES - 1, 8 * 60) * 60, {
      writeInputs: true,
      writeSlider: false
    });
    refreshTestUi();
  };

  window.syncTestFromInputs = function () {
    unlockTestControls();
    var h = parseInt((el('in-h') || {}).value, 10);
    if (Number.isFinite(h) && h >= 24) {
      clearSavedPausedTime();
      window.TEST_DAY = selectedDay();
      window.TEST_TIME_SEC = END_OF_DAY_SECONDS;
      setEndOfDayInputs();
      refreshTestUi();
      return;
    }
    clearSavedPausedTime();
    endOfDayArmed = false;
    pausedAtManualRollover = false;
    pauseForEditing();
    window.TEST_DAY = selectedDay();
    setSimSeconds(getTypedTargetSeconds(), { writeInputs: false, writeSlider: true });
    refreshTestUi();
  };

  window.syncTestDayChange = function () {
    clearSavedPausedTime();
    endOfDayArmed = false;
    pausedAtManualRollover = false;
    pauseForEditing();
    writeDay(selectedDay());
    setSimSeconds(DAY_START_SECONDS, { writeInputs: true, writeSlider: true });
    refreshTestUi();
  };

  function startManualEndpointRun(day) {
    writeDay(day);
    window.MANUALLY_TEST = true;
    window.IS_SIMULATING = true;
    window.TEST_TIME_SEC = END_OF_DAY_SECONDS - START_LEAD_SECONDS;
    endOfDayArmed = true;
    pausedAtManualRollover = false;
    setEndOfDayInputs();
    refreshTestUi();
  }

  window.toggleTestPlayPause = function (event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }
    unlockTestControls();
    var wasRunning = !!(window.MANUALLY_TEST && window.IS_SIMULATING);
    var day = selectedDay();
    var targetSeconds = selectedTargetSeconds();

    if (!wasRunning && savedPausedSecond !== null) {
      writeDay(savedPausedDay);
      window.MANUALLY_TEST = true;
      window.IS_SIMULATING = true;
      window.TEST_TIME_SEC = savedPausedSecond;
      clearSavedPausedTime();
      endOfDayArmed = false;
      refreshTestUi();
      return false;
    }
    if (!wasRunning && pausedAtManualRollover && targetSeconds < START_LEAD_SECONDS) {
      window.MANUALLY_TEST = true;
      window.IS_SIMULATING = true;
      window.TEST_TIME_SEC = 0;
      setStartOfDayInputs();
      pausedAtManualRollover = false;
      refreshTestUi();
      return false;
    }
    if (!wasRunning && targetSeconds < START_LEAD_SECONDS) {
      writeDay(day);
      window.MANUALLY_TEST = true;
      window.IS_SIMULATING = true;
      window.TEST_TIME_SEC = targetSeconds;
      setStartOfDayInputs();
      pausedAtManualRollover = false;
      refreshTestUi();
      return false;
    }
    if (!wasRunning && targetSeconds >= END_OF_DAY_SECONDS) {
      startManualEndpointRun(day);
      return false;
    }
    if (!wasRunning) {
      writeDay(day);
      window.MANUALLY_TEST = true;
      window.IS_SIMULATING = true;
      setSimSeconds(targetSeconds - START_LEAD_SECONDS, { writeInputs: false, writeSlider: true });
    } else {
      window.IS_SIMULATING = false;
      savedPausedSecond = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : null;
      savedPausedDay = normalizeDay(window.TEST_DAY);
    }
    if (!(window.MANUALLY_TEST && window.IS_SIMULATING)) endOfDayArmed = false;
    refreshTestUi();
    return false;
  };

  window.exitTestMode = function () {
    window.MANUALLY_TEST = false;
    window.IS_SIMULATING = false;
    endOfDayArmed = false;
    pausedAtManualRollover = false;
    clearSavedPausedTime();
    try {
      localStorage.removeItem(TEST_STATE_STORAGE_KEY);
    } catch (error) {
      console.warn('Unable to clear test mode state.', error);
    }
    var status = el('sim-status');
    if (status) status.innerText = '';
    var indicator = el('sim-indicator');
    if (indicator) indicator.style.display = 'none';
    enableExitButton();
    syncTestPlayPauseUi();
    syncTestingBody();
    syncTestToolbar();
    if (typeof closeTestPanel === 'function') closeTestPanel();
    window.update();
  };
  window.forceAppRefresh = function () {
    function reloadNow() {
      var url = new URL(window.location.href);
      url.searchParams.set('refresh', String(Date.now()));
      window.location.replace(url.toString());
    }
    // Prime the HTTP cache with network-fresh copies of the app shell's own
    // assets first, so the reload below is a true full reload (picks up a
    // new deploy even when its version query string didn't change) instead
    // of a plain refresh that can still be served straight from disk cache.
    var refetches = [window.location.href.replace(/[?#].*$/, '')]
      .concat(getVersionedAssetUrls())
      .map(function (url) {
        return fetch(url, { cache: 'reload' }).catch(function () {});
      });
    Promise.all(refetches).then(reloadNow, reloadNow);
  };

  function bindPlayButton() {
    var oldBtn = el('test-play-pause-btn');
    if (!oldBtn || (oldBtn.dataset && oldBtn.dataset.orbitConsolidatedBound === '1')) return;
    var btn = oldBtn.cloneNode(true);
    btn.removeAttribute('onclick');
    btn.onclick = null;
    btn.dataset.orbitConsolidatedBound = '1';
    oldBtn.parentNode.replaceChild(btn, oldBtn);
    btn.addEventListener('click', window.toggleTestPlayPause, true);
  }
  function bindExitButtons() {
    var exit = el('test-exit-btn');
    if (exit && !exit.orbitConsolidatedBound) {
      exit.disabled = false;
      exit.removeAttribute('disabled');
      exit.addEventListener(
        'click',
        function (event) {
          event.preventDefault();
          event.stopPropagation();
          window.exitTestMode();
        },
        true
      );
      exit.orbitConsolidatedBound = true;
    }
  }
  function bindInputPauses() {
    ['in-h', 'in-m', 'test-day-input'].forEach(function (id) {
      var node = el(id);
      if (!node || node.orbitConsolidatedPauseBound) return;
      node.addEventListener('focus', pauseForEditing, true);
      node.addEventListener('input', pauseForEditing, true);
      node.orbitConsolidatedPauseBound = true;
    });
    var slider = el('test-time-slider');
    if (slider && !slider.orbitEndpointLockBound) {
      ['pointerup', 'mouseup', 'touchend', 'keyup', 'blur', 'change'].forEach(function (eventName) {
        slider.addEventListener(eventName, clearSliderEndpointLock, true);
      });
      slider.orbitEndpointLockBound = true;
    }
  }
  function init() {
    mergeNextClassWithTimer();
    unlockTestControls();
    // syncAppVersion() is deliberately not called here: it re-fetches the
    // page and its bundled JS/CSS over the network (with cache: 'no-store')
    // just to compute a version hash for a span that's only visible inside
    // this Test Mode panel. Calling it on every single page load - for
    // every visitor, whether or not they ever open this panel - wasted
    // three full network requests per load. patchPanelOpeners() now calls
    // it only when the panel is actually opened.
    var restoredTestState = restoreTestState();
    if (!defaultsInitialized && !restoredTestState) {
      setDefaultsToCurrentTime(true);
      defaultsInitialized = true;
    }
    if (restoredTestState) {
      updateInputDisplay();
      var slider = el('test-time-slider');
      if (slider) slider.value = String(Math.floor(window.TEST_TIME_SEC / 60));
    }
    patchPanelOpeners();
    patchUpdate();
    bindPlayButton();
    bindExitButtons();
    bindInputPauses();
    syncTestChrome();
    applyDashboardState();
    finishBoot();
    window.update();
  }

  init();
})();
