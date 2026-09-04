// ---- src/strings.js ----
// A lookup table for UI strings, starting with zh-TW only (the app's only
// current language) - populated 1:1 from the literals that used to be
// inline. This doesn't add a second language; it turns "add one later"
// into filling in another locale object here instead of hunting through
// every module for embedded Chinese text.
//
// Not every string in the app has been migrated here yet - this covers the
// dashboard's status/countdown labels (schedule-calc.js) as a worked
// example of the convention. Extend it the same way: add the key under
// `zh-TW`, call `t('the.key')` where the literal used to be.
const STRINGS = {
  'zh-TW': {
    'dashboard.notStarted': '尚未開始',
    'dashboard.schoolOver': '放學時間',
    'dashboard.noSchoolToday': '今日無課',
    'dashboard.betweenClasses': '下課',
    'dashboard.duringClass': '上課',
    'dashboard.seeYouWeekend': '週末愉快',
    'dashboard.seeYouTomorrow': '再見',
    'dashboard.seeYouMonday': '週一見',
    'dashboard.loading': '載入中…'
  }
};

// No locale switcher exists yet (there's only one locale) - this stays a
// plain constant until a second locale and a way to choose it are added,
// at which point it becomes a mutable value with a setter alongside it.
const currentLocale = 'zh-TW';

/**
 * Looks up a UI string by key in the current locale, falling back to zh-TW
 * (and then the key itself) if a locale is ever added that's missing one.
 */
function t(key) {
  return STRINGS[currentLocale]?.[key] ?? STRINGS['zh-TW'][key] ?? key;
}

export { t };
