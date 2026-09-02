// App defaults and live simulator state.
const ORBIT_INITIAL_MARKUP = document.documentElement.outerHTML;
const REVERSE_WEEK_LOGIC_DEFAULT = false;
const DEFAULT_STYLE_PRIMARY = '#0A84FF';
const DEFAULT_STYLE_SECONDARY = '#5856D6';
window.MANUALLY_TEST = false;
window.TEST_DAY = 1;
window.TEST_TIME_SEC = 8 * 3600;
window.IS_SIMULATING = false;

const DEFAULT_TEACHER_DB = {
  "01國文": [
    "國文",
    ""
  ],
  "02英文": [
    "英文",
    ""
  ],
  "03數學": [
    "數學",
    ""
  ],
  "04歷史": [
    "歷史",
    ""
  ],
  "10自主": [
    "自主學習",
    ""
  ],
  "07體育": [
    "體育",
    ""
  ],
  "08班會": [
    "班會課",
    ""
  ],
  "06公民": [
    "公民",
    ""
  ],
  "05地理": [
    "地理",
    ""
  ],
};

const DEFAULT_LOCATION_DB = {
  "國文": "",
  "英文": "",
  "數學": "",
  "歷史": "",
  "自主": "",
  "體育": "",
  "班會": "",
  "公民": "",
  "地理": "",
  "國寫": "",
  "學策": "",
  "英作": ""
};

const DEFAULT_WEEKLY_SCHEDULE = {
  1: [],
  2: [ ],
  3: [],
  4: [],
  5: []
};

const DEFAULT_BELL_TIMES = [
  [
    "08:00",
    "08:50"
  ],
  [
    "09:10",
    "10:00"
  ],
  [
    "10:10",
    "11:00"
  ],
  [
    "11:10",
    "12:00"
  ],
  [
    "13:00",
    "13:50"
  ],
  [
    "14:00",
    "14:50"
  ],
  [
    "15:00",
    "15:50"
  ],
  [
    "15:55",
    "16:45"
  ]
];

const DEFAULT_BREAK_TIMES = [
  {
    name: "打掃時間",
    start: "08:50",
    end: "09:10"
  },
  {
    name: "中午時間",
    start: "12:00",
    end: "13:00"
  }
];
const DEFAULT_COUNTDOWN_EVENT = { name: '116 學測', date: '2027-01-22' };
const DEFAULT_COUNTDOWN_EVENTS = [DEFAULT_COUNTDOWN_EVENT];
// Shared validation and normalization keeps saved and imported data predictable.
function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value||''))) return false;
  const [hours,minutes]=String(value).split(':').map(Number);
  return hours>=0&&hours<=23&&minutes>=0&&minutes<=59;
}
function isValidTimeRange(start,end) {
  if (!isValidTime(start)||!isValidTime(end)) return false;
  const toMinutes=value=> {
    const [hours,minutes]=value.split(':').map(Number);
    return hours*60+minutes
  };
  return toMinutes(end)>toMinutes(start)
}
function validateTimeIntervals(bellTimes,breakTimes) {
  const intervals=[];
  const addInterval=(start,end,label)=> {
    if (!isValidTimeRange(start,end)) throw new Error(`${label}時間必須是有效的開始與結束時間。`);
    intervals.push({start,end,label})
  };
  (bellTimes||[]).forEach((item,index)=>addInterval(item[0],item[1],`第 ${index+1} 節`));
  (breakTimes||[]).forEach(item=>addInterval(item.start,item.end,`特殊時段「${item.name}」`));
  intervals.sort((a,b)=>editorTimeToMinutes(a.start)-editorTimeToMinutes(b.start)||editorTimeToMinutes(a.end)-editorTimeToMinutes(b.end));
  intervals.forEach((item,index)=> {
    if (index>0&&editorTimeToMinutes(item.start)<editorTimeToMinutes(intervals[index-1].end)) throw new Error(`時間衝突：${intervals[index-1].label} 與 ${item.label} 重疊。`)
  });
}
function normalizeCountdownEvent(value) {
  const source=value&&typeof value==='object'?value:{};
  const name=String(source.name||'').trim().slice(0,80);
  const date=String(source.date||'').trim();
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { name, date };
}
function normalizeCountdownEvents(value) {
  const source=Array.isArray(value)?value:[];
  const events=source.map(normalizeCountdownEvent).filter(Boolean).slice(0,12);
  return events.length ? events : (Array.isArray(value) ? [] : DEFAULT_COUNTDOWN_EVENTS.map(event=>({...event})));
}
const ORBIT_APP_ID='Orbit_Color';
const ORBIT_STORAGE_SCHEMA='r8N3wL0yS5qM9uV7';

function getDefaultData() {
  return {
    teacherDB: DEFAULT_TEACHER_DB,
    teacherOrder: Object.keys(DEFAULT_TEACHER_DB),
    locationDB: { ...DEFAULT_LOCATION_DB },
    weeklySchedule: { ...DEFAULT_WEEKLY_SCHEDULE },
    bellTimes: DEFAULT_BELL_TIMES.map(period => [...period]),
    breakTimes: DEFAULT_BREAK_TIMES.map(item => ({ ...item })),
    countdownEvents: DEFAULT_COUNTDOWN_EVENTS.map(event => ({ ...event })),
    reverseWeek: REVERSE_WEEK_LOGIC_DEFAULT,
    proAccent: DEFAULT_STYLE_PRIMARY,
    proSecondary: DEFAULT_STYLE_SECONDARY,
    proTertiary: DEFAULT_STYLE_SECONDARY,
    styleSlots: normalizeStyleSlots([]),
    geminiApiKey: getStoredGeminiApiKey()
  };
}

function sanitizeBreakTimes(bellTimes, breakTimes = []) {
  const validBreaks = [];
  const source = Array.isArray(breakTimes) ? breakTimes : [];
  source.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const name = String(item.name || '').trim();
    const start = String(item.start || '').trim();
    const end = String(item.end || '').trim();
    if (!name && !start && !end) return;
    if (!name || !isValidTimeRange(start, end)) return;
    try {
      validateTimeIntervals(bellTimes, [...validBreaks, { name, start, end }]);
      validBreaks.push({ name, start, end });
    } catch (error) {
      // Keep a valid timetable even if one optional break conflicts.
    }
  });

  DEFAULT_BREAK_TIMES.forEach(defaultBreak => {
    if (validBreaks.some(item => item.name === defaultBreak.name)) return;
    try {
      validateTimeIntervals(bellTimes, [...validBreaks, { ...defaultBreak }]);
      validBreaks.push({ ...defaultBreak });
    } catch (error) {
      // Only add the default break when it fits the current timetable.
    }
  });

  return validBreaks;
}

function loadData()  {
  try {
    const raw = localStorage.getItem('classFocusData');
    if (!raw) return getDefaultData();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return getDefaultData();

    const required = ['teacherDB', 'locationDB', 'weeklySchedule', 'bellTimes'];
    if (!required.every(key => Object.prototype.hasOwnProperty.call(parsed, key))) return getDefaultData();
    if (!parsed.teacherDB || typeof parsed.teacherDB !== 'object' || Array.isArray(parsed.teacherDB)) return getDefaultData();
    if (!parsed.locationDB || typeof parsed.locationDB !== 'object' || Array.isArray(parsed.locationDB)) return getDefaultData();
    if (!parsed.weeklySchedule || typeof parsed.weeklySchedule !== 'object' || Array.isArray(parsed.weeklySchedule)) return getDefaultData();
    if (!Array.isArray(parsed.bellTimes)) return getDefaultData();
    if (Object.values(parsed.teacherDB).some(value => !Array.isArray(value))) return getDefaultData();
    if (Object.values(parsed.weeklySchedule).some(value => !Array.isArray(value))) return getDefaultData();
    if (!parsed.bellTimes.every(item => Array.isArray(item) && item.length >= 2 && isValidTimeRange(String(item[0] || ''), String(item[1] || '')))) return getDefaultData();

    const bellTimes = parsed.bellTimes.map(item => [String(item[0]), String(item[1])]);
    const normalized = {
      teacherDB: Object.fromEntries(Object.entries(parsed.teacherDB).map(([key, value]) => [String(key).trim(), Array.isArray(value) ? [String(value[0] || ''), String(value[1] || ''), String(value[2] || '')] : ['', '', '']])),
      teacherOrder: Array.isArray(parsed.teacherOrder) ? parsed.teacherOrder.filter(Boolean).map(String) : Object.keys(parsed.teacherDB),
      locationDB: Object.fromEntries(Object.entries(parsed.locationDB).map(([key, value]) => [String(key).trim(), String(value || '')])),
      weeklySchedule: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(day => {
        const row = Array.isArray(parsed.weeklySchedule[day] || parsed.weeklySchedule[String(day)]) ? parsed.weeklySchedule[day] || parsed.weeklySchedule[String(day)] : [];
        return [day, row.map(item => String(item || ''))];
      })),
      bellTimes,
      breakTimes: sanitizeBreakTimes(bellTimes, parsed.breakTimes),
      countdownEvents: normalizeCountdownEvents(parsed.countdownEvents),
      reverseWeek: typeof parsed.reverseWeek === 'boolean' ? parsed.reverseWeek : REVERSE_WEEK_LOGIC_DEFAULT,
      proAccent: normalizeProAccent(parsed.proAccent),
      proSecondary: normalizeProSecondary(parsed.proSecondary),
      proTertiary: normalizeProTertiary(parsed.proTertiary),
      styleSlots: normalizeStyleSlots(parsed.styleSlots),
      geminiApiKey: Object.prototype.hasOwnProperty.call(parsed, 'geminiApiKey') ? String(parsed.geminiApiKey || '') : getStoredGeminiApiKey()
    };

    return normalized;
  } catch (error) {
    return getDefaultData();
  }
}
// Persists the editable schedule data in the browser.
function saveData(d)  {
  try  {
    localStorage.setItem('classFocusData',JSON.stringify({...d,__orbit:{app:ORBIT_APP_ID,schema:ORBIT_STORAGE_SCHEMA}}))
  }
  catch (e)  {
  }
}
// Runtime schedule data is rebuilt from the editable settings before display.
const dayNames=[
"日",
"一",
"二",
"三",
"四",
"五",
"六"
];
