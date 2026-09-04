// ---- js/data.js ----
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
const DEFAULT_COUNTDOWN_EVENT = { name: '116 學測', startDate: '2027-01-22', endDate: '2027-01-24' };
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
  const isDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||'').trim());
  const legacyDate=String(source.date||'').trim();
  let startDate=String(source.startDate||legacyDate||'').trim();
  let endDate=String(source.endDate||legacyDate||startDate||'').trim();
  if (!name || !isDate(startDate) || !isDate(endDate)) return null;
  if (endDate<startDate) { const swap=startDate; startDate=endDate; endDate=swap; }
  return { name, startDate, endDate };
}
// Formats a countdown event's date(s) for display, e.g. "2027.01.22" or "2027.01.22–01.24".
function formatCountdownEventDate(event) {
  const dot=value=>String(value||'').replaceAll('-','.');
  if (!event) return '';
  if (event.startDate===event.endDate) return dot(event.startDate);
  const endShort=event.endDate.slice(event.startDate.slice(0,4)===event.endDate.slice(0,4)?5:0);
  return `${dot(event.startDate)}–${dot(endShort)}`;
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

// ---- js/schedule.js ----
let runtimeSchedule =   {
};
// Builds the runtime schedule rows from teacher, location, and bell-time data.
function buildSchedule()  {
  runtimeSchedule=  {
  };
  [
  0,
  1,
  2,
  3,
  4,
  5,
  6
  ].forEach(day=>  {
    runtimeSchedule[day] =(applicationData.weeklySchedule[day]
    ||[
    ]).map((key,i)=>  {
      if (!key)return null;
      const m=applicationData.teacherDB[key]
      ||[
      "未知",
      "未知"
      ];
      const bt=applicationData.bellTimes[i];
      if (!bt)return null;
      return  {
        key, n: m[0], t: m[1], s: bt[0], e: bt[1], isSplit: m[0].includes('/'), loc: applicationData.locationDB[key]
        ||""
      }
    })
    .filter(Boolean)
  })
  ;
  renderNavBar()
}
// Renders weekday navigation buttons based on which days have classes.
function renderNavBar()  {
  const navBar=document.querySelector('.nav-bar');
  if (!navBar)return;
  const days=[
  1,
  2,
  3,
  4,
  5
  ];
  const hasWE=(runtimeSchedule[0]
  &&runtimeSchedule[0].length>0)||(runtimeSchedule[6]
  &&runtimeSchedule[6].length>0);
  if (hasWE)  {
    if (runtimeSchedule[6]
    &&runtimeSchedule[6].length>0)days.push(6);
    if (runtimeSchedule[0]
    &&runtimeSchedule[0].length>0)days.push(0)
  }
  const labels=  {
    0:'週日',
    1:'週一',
    2:'週二',
    3:'週三',
    4:'週四',
    5:'週五',
    6:'週六'};
  navBar.innerHTML=days.map(d=>`<button class="nav-item" data-day="${d}" onclick="handleNav(${d})" tabindex="0">${labels[d]}</button>`).join('')
}
let viewDay = (new Date().getDay()===0||new Date().getDay()===6)?1: new Date().getDay();
let todayDay = viewDay;
let lastListKey = "";
let autoAdvancedAfterFinishedDay = null;
let lastAutoScrollKey = "";
let allowProgrammaticListScroll = false;
let clampScrollFrame = 0;
// Converts an HH:MM time string into minutes after midnight.
function parseTime(t)  {
  const[
  h,
  m
  ] =t.split(':').map(Number);
  return h*60+m
}
// Pads a number to two digits for clock display.
function pad2(n)  {
  return String(n).padStart(2,'0')
}
// Calculates the ISO week number used for odd/even week logic.
function getISOWeekNumber(date)  {
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const dayNum=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-dayNum);
  const ys=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d-ys)/86400000)+1)/7)
}
// Returns the current odd/even week label, respecting the reverse-week setting.
function getWeekType()  {
  const now=new Date();
  const wn=getISOWeekNumber(now);
  const even=wn%2===0;
  return applicationData.reverseWeek?(even?"單":"雙"):(even?"雙":"單")
}
// Creates the small odd/even week badge used in the schedule UI.
function getWeekLabelHtml(w)  {
  return `<span class="week-label ${(w==="單")?"label-odd":"label-even"}">${w}週</span>`
}
// Returns the next weekday tab after the given day.
function getNextSchoolDay(day) {
  for (let step=1;step<=7;step++)  {
    const next=(day+step)%7;
    if ((runtimeSchedule[next]||[]).length>0)return next
  }
  if (day>=1&&day<=4) return day+1;
  return 1
}
// Chooses the correct subject and teacher for split odd/even-week classes.
function processSplitName(c,week)  {
  if (!c.isSplit)return  {
    n: c.n, t: c.t, label:""
  };
  const nP=c.n.split('/'),
  tP=c.t.split('/');
  return  {
    n:(week==="單")?nP[0].trim(): nP[1].trim(), t:(week==="單")?tP[0].trim():(tP[1]
    ||tP[0]).trim(), label: getWeekLabelHtml(week)
  }
}

// ---- js/appearance.js ----
function normalizeProAccent(value) {
  const color=String(value||'').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color)?color:DEFAULT_STYLE_PRIMARY
}
function normalizeProSecondary(value) {
  const color=String(value||'').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color)?color:DEFAULT_STYLE_SECONDARY
}
function normalizeProTertiary(value) {
  const color=String(value||'').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color)?color:'#91AE78'
}
function getReadableTextColor(value) {
  const color=normalizeProAccent(value).slice(1);
  const channels=[0,2,4].map(index=>parseInt(color.slice(index,index+2),16)/255).map(channel=>channel<=.03928?channel/12.92:Math.pow((channel+.055)/1.055,2.4));
  const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  const whiteContrast=1.05/(luminance+.05);
  const darkContrast=(luminance+.05)/.05;
  return darkContrast>=whiteContrast?'#10171A':'#FFFFFF'
}
function getReadableSurfaceColor(value) {
  const color=normalizeProAccent(value).slice(1);
  const channels=[0,2,4].map(index=>parseInt(color.slice(index,index+2),16)/255).map(channel=>channel<=.03928?channel/12.92:Math.pow((channel+.055)/1.055,2.4));
  const luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2];
  const surfaceLuminance=.008;
  const contrast=(Math.max(luminance,surfaceLuminance)+.05)/(Math.min(luminance,surfaceLuminance)+.05);
  return contrast>=3?'#'+color:'#F4FBFF'
}
function normalizeStyleSlots(value) {
  const slots=Array.isArray(value)?value:[];
  return Array.from({length:5},(_,index)=> {
    const source=slots[index]&&typeof slots[index]==='object'?slots[index]:{};
    return {
      name:String(source.name||'').trim().slice(0,12),
      primary:normalizeProAccent(source.primary),
      secondary:normalizeProSecondary(source.secondary),
      
    }
  })
}
function deriveProSupportColors(primary) {
  const color=normalizeProAccent(primary).slice(1);
  const rgb=[0,2,4].map(index=>parseInt(color.slice(index,index+2),16)/255);
  const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
  let hue=0;
  if (delta) {
    if (max===rgb[0]) hue=60*((rgb[1]-rgb[2])/delta%6);
    else if (max===rgb[1]) hue=60*((rgb[2]-rgb[0])/delta+2);
    else hue=60*((rgb[0]-rgb[1])/delta+4);
  }
  if (hue<0) hue+=360;
  const lightness=(max+min)/2;
  const saturation=delta?delta/(1-Math.abs(2*lightness-1)):0;
  const toHex=value=>Math.round(value*255).toString(16).padStart(2,'0').toUpperCase();
  const hslToHex=(h,s,l)=> {
    const chroma=(1-Math.abs(2*l-1))*s;
    const x=chroma*(1-Math.abs((h/60)%2-1));
    const match=h<60?[chroma,x,0]:h<120?[x,chroma,0]:h<180?[0,chroma,x]:h<240?[0,x,chroma]:h<300?[x,0,chroma]:[chroma,0,x];
    const matchMin=l-chroma/2;
    return `#${match.map(value=>toHex(value+matchMin)).join('')}`
  };
  return {
    secondary:hslToHex((hue+28)%360,Math.max(.28,Math.min(.66,saturation*.72)),Math.max(.38,Math.min(.56,lightness*.92))),
    tertiary:hslToHex((hue+190)%360,Math.max(.18,Math.min(.42,saturation*.48)),Math.max(.5,Math.min(.7,lightness*1.18)))
  }
}
const PRO_PALETTE_PRESETS={
  default:{primary:DEFAULT_STYLE_PRIMARY,secondary:DEFAULT_STYLE_SECONDARY},
  rose:{primary:'#F06F61',secondary:'#C44C78'},
  ocean:{primary:'#18B7A0',secondary:'#2E6FD8'},
  midnight:{primary:'#263B68',secondary:'#6A4C93'},
  graphite:{primary:'#A7C957',secondary:'#557A3E'}
};
function applyProAccent(data=applicationData) {
  const accent=normalizeProAccent(data.proAccent);
  const secondary=normalizeProSecondary(data.proSecondary);
  document.body.style.setProperty('--pro-accent',accent);
  document.body.style.setProperty('--pro-secondary',secondary);
  document.body.style.setProperty('--pro-accent-text',getReadableTextColor(accent));
  document.body.style.setProperty('--pro-secondary-text',getReadableTextColor(secondary));
  document.body.style.setProperty('--pro-accent-readable',getReadableSurfaceColor(accent));
  document.body.style.setProperty('--pro-secondary-readable',getReadableSurfaceColor(secondary));
}
// Style-panel changes are previewed first, then committed through the save pipeline.
// Switches to the Orbit Color visual skin.
function setStyleMode() {
  document.body.classList.add('pro-style');
  applyProAccent();
  renderStylePanel();
  refreshStyleModeLayout()
}
function refreshStyleModeLayout() {
  requestAnimationFrame(() => {
    const list=document.getElementById('schedule-list');
    if (list) {
      delete list.dataset.autoAlignedTop;
      lastAutoScrollKey=null
    }
    if (typeof update==='function') update();
    requestAnimationFrame(() => {
      if (typeof fitNowTitleText==='function') fitNowTitleText(true)
    })
  })
}
function renderStylePanel() {
  stylePanelDraft={...applicationData,styleSlots:normalizeStyleSlots(applicationData.styleSlots)};
  const primary=document.getElementById('style-primary-input');
  const secondary=document.getElementById('style-secondary-input');
  if (primary) primary.value=normalizeProAccent(applicationData.proAccent);
  if (secondary) secondary.value=normalizeProSecondary(applicationData.proSecondary);
  document.getElementById('style-panel')?.classList.remove('style-draft-dirty');
  renderStyleSlots();
  setStylePanelMode('editor')
}
function getStyleDraftFromControls() {
  const primary=document.getElementById('style-primary-input');
  const secondary=document.getElementById('style-secondary-input');
  return {...stylePanelDraft,proAccent:normalizeProAccent(primary?.value||stylePanelDraft.proAccent),proSecondary:normalizeProSecondary(secondary?.value||stylePanelDraft.proSecondary),proTertiary:normalizeProSecondary(secondary?.value||stylePanelDraft.proSecondary)}
}
function previewStyleSettings() {
  stylePanelDraft=getStyleDraftFromControls();
  applyStyleVisual(stylePanelDraft);
  document.getElementById('style-panel')?.classList.add('style-draft-dirty')
}
function setStylePanelMode(mode) {
  const editor=document.getElementById('style-editor-content');
  const preview=document.getElementById('style-preview-state');
  const editorActions=document.getElementById('style-editor-actions');
  const isPreview=mode==='preview';
  if (editor) editor.hidden=isPreview;
  if (preview) preview.hidden=!isPreview;
  if (editorActions) editorActions.hidden=isPreview;
}
function enterStylePreview() {
  stylePanelDraft=getStyleDraftFromControls();
  applyStyleVisual(stylePanelDraft);
  document.getElementById('style-panel')?.classList.add('style-draft-dirty');
  setStylePanelMode('preview')
}
function exitStylePreview() {
  setStylePanelMode('editor')
}
function applyStyleVisual(style) {
  document.body.classList.add('pro-style');
  applyProAccent(style);
  if (typeof update==='function') update()
}
// Builds the preview draft into a full settings object and saves it with the
// same settings pipeline used by the class editor.
function confirmStyleSettings() {
  stylePanelDraft=stylePanelDraft||getStyleDraftFromControls();
  const next=cloneSettingsData(applicationData);
  next.proAccent=normalizeProAccent(stylePanelDraft.proAccent);
  next.proSecondary=normalizeProSecondary(stylePanelDraft.proSecondary);
  next.proTertiary=next.proSecondary;
  next.styleSlots=normalizeStyleSlots(stylePanelDraft.styleSlots);
  pendingStyleSaveData=next;
  applyPendingStyleSave()
}
// Commits a confirmed style change through the same applyEditorSettingsData
// pipeline as saving or importing the class editor (saves, rebuilds the
// schedule, refreshes the editor baseline, and shows the save toast).
function applyPendingStyleSave() {
  if (!pendingStyleSaveData) {
    hideEditorDiscardConfirm();
    return
  }
  applyEditorSettingsData(pendingStyleSaveData,{statusMessage:'樣式已儲存。'});
  setStyleMode('pro');
  pendingStyleSaveData=null;
  document.getElementById('style-panel')?.classList.remove('style-draft-dirty');
  hideEditorDiscardConfirm();
  closeStylePanel()
}
function renderStyleSlots() {
  const grid=document.getElementById('style-slot-grid');
  if (!grid)return;
  const slots=normalizeStyleSlots(stylePanelDraft?.styleSlots||applicationData.styleSlots);
  grid.innerHTML=slots.map((slot,index)=>`<div class="style-slot-row"><button type="button" class="style-slot ${slot.name?'has-style':''}" style="--slot-primary:${slot.primary};--slot-secondary:${slot.secondary}" onclick="loadStyleSlot(${index})" aria-label="${esc(slot.name||`空位 ${index+1}`)}" title="${esc(slot.name||`空位 ${index+1}`)}"><span class="style-slot-swatch" aria-hidden="true"></span></button><button type="button" class="style-slot-save" onclick="saveStyleSlot(${index})" aria-label="儲存至樣式 ${index+1}">＋</button></div>`).join('')
}
function saveStyleSlot(index) {
  stylePanelDraft=getStyleDraftFromControls();
  const slots=normalizeStyleSlots(stylePanelDraft.styleSlots);
  if (slots[index]?.name) {
    pendingStyleSlotSaveIndex=index;
    setEditorConfirmContent('覆寫個人樣式？','這會取代目前儲存在這個位置的配色。','', '覆寫', applyPendingStyleSlotSave, '取消');
    showEditorConfirmSheet();
    return
  }
  saveStyleSlotDraft(index)
}
function saveStyleSlotDraft(index) {
  const slots=normalizeStyleSlots(stylePanelDraft.styleSlots);
  slots[index]={name:slots[index].name||`樣式 ${index+1}`,primary:stylePanelDraft.proAccent,secondary:stylePanelDraft.proSecondary};
  stylePanelDraft.styleSlots=slots;
  renderStyleSlots();
  setStylePanelMode('editor')
}
function applyPendingStyleSlotSave() {
  const index=pendingStyleSlotSaveIndex;
  pendingStyleSlotSaveIndex=null;
  hideEditorDiscardConfirm();
  if (index!==null) saveStyleSlotDraft(index)
}
function loadStyleSlot(index) {
  const slot=normalizeStyleSlots(stylePanelDraft?.styleSlots||applicationData.styleSlots)[index];
  if (!slot||!slot.name)return;
  pendingStyleSlotIndex=index;
  setEditorConfirmContent('套用儲存樣式？','目前的樣式將被替換。','', '套用', applyPendingStyleSlot, '返回');
  showEditorConfirmSheet();
}
function applyPendingStyleSlot() {
  const slot=normalizeStyleSlots(stylePanelDraft?.styleSlots||applicationData.styleSlots)[pendingStyleSlotIndex];
  if (!slot||!slot.name)return;
  document.getElementById('style-primary-input').value=slot.primary;
  document.getElementById('style-secondary-input').value=slot.secondary;
  pendingStyleSlotIndex=null;
  hideEditorDiscardConfirm();
  previewStyleSettings()
}
async function toggleStylePanel() {
  const editor=document.getElementById('editor-sheet');
  if (editor.classList.contains('show')) {
    if (isEditorDirty()||await hasUnconsumedImportData()) {
      pendingAfterEditorDiscard='style';
      await showEditorDiscardConfirm();
      return
    }
    closeEditor(true)
  }
  const panel=document.getElementById('style-panel');
  if (panel.classList.contains('show')) {
    closeStylePanel()
  } else {
    closeTestPanel();
    openStylePanel()
  }
}
// Opens Style Mode directly (used by the toolbar toggle and, after
// discarding editor changes, by discardEditorChangesAndClose).
function openStylePanel(resetDraft=true) {
  if (resetDraft || !stylePanelDraft) renderStylePanel();
  setOverlayVisible('style-panel-overlay','style-panel',true,'style-panel-open')
}
function closeStylePanel() {
  const panel=document.getElementById('style-panel');
  if (panel.classList.contains('show') && panel.classList.contains('style-draft-dirty')) {
    showStyleDiscardConfirm();
    return
  }
  setOverlayVisible('style-panel-overlay','style-panel',false,'style-panel-open')
}
function showStyleDiscardConfirm() {
  setEditorConfirmContent('尚未套用樣式？','離開將捨棄目前的樣式預覽。','', '捨棄並離開', discardStyleChangesAndClose, '返回');
  showEditorConfirmSheet()
}
function discardStyleChangesAndClose() {
  hideEditorDiscardConfirm();
  setOverlayVisible('style-panel-overlay','style-panel',false,'style-panel-open');
  setStyleMode('pro');
  document.getElementById('style-panel')?.classList.remove('style-draft-dirty')
}
function applyStylePreset(name) {
  const preset=PRO_PALETTE_PRESETS[name];
  if (!preset)return;
  const primary=document.getElementById('style-primary-input');
  const secondary=document.getElementById('style-secondary-input');
  if (primary) primary.value=preset.primary;
  if (secondary) secondary.value=preset.secondary||deriveProSupportColors(preset.primary).secondary;
  previewStyleSettings()
}
let stylePanelDraft = null;
let testPanelOpen = false;
let pendingAfterEditorDiscard = null;
let pendingEditorImportData = null;
let pendingEditorSaveData = null;
let editorBaselineData = null;
let pendingBellDelete = null;
let pendingTeacherDelete = null;
let pendingStyleSaveData = null;
let pendingStyleSlotIndex = null;
let pendingStyleSlotSaveIndex = null;

// ---- js/dashboard.js ----
// Opens or closes the manual time simulation panel.
// Modal and toolbar state is separate from saved schedule settings.
async function toggleTestPanel()  {
  const editorSheet=document.getElementById('editor-sheet');
  if (editorSheet.classList.contains('show')) {
    if (isEditorDirty()||await hasUnconsumedImportData()) {
      pendingAfterEditorDiscard='test';
      await showEditorDiscardConfirm();
      return
    }
    closeEditor(true)
  }
  testPanelOpen=!testPanelOpen;
  setOverlayVisible('test-panel-overlay','debug-panel',testPanelOpen);
  closeStylePanel();
  syncTestToolbar()
}
// Closes the manual time simulation panel.
function closeTestPanel()  {
  testPanelOpen=false;
  setOverlayVisible('test-panel-overlay','debug-panel',false);
  syncTestToolbar()
}
// Opens Test Mode directly after another UI has been safely closed.
function openTestPanel() {
  testPanelOpen=true;
  setOverlayVisible('test-panel-overlay','debug-panel',true);
  syncTestToolbar()
}
// Keeps the toolbar test button state in sync with simulation mode.
function syncTestToolbar()  {
  const btn=document.getElementById('btn-test');
  if (!btn)return;
  btn.classList.toggle('active',testPanelOpen);
  btn.classList.toggle('manual-test-on',!!window.MANUALLY_TEST);
  btn.classList.toggle('sim-running',!!window.IS_SIMULATING)
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
  const settle = (open) => {
    panel.style.transition = open
      ? 'transform .35s cubic-bezier(.16,1,.3,1)'
      : 'transform .22s cubic-bezier(.4,0,1,1)';
    panel.style.transform = open ? 'translateY(0)' : `translateY(${panel.offsetHeight + 40}px)`;
    setTimeout(() => {
      panel.style.transition = '';
      panel.style.transform = '';
    }, open ? 360 : 230);
  };
  const move = (event) => {
    if (!dragging) return;
    const deltaY = Math.max(0, event.clientY - startY);
    panel.style.transform = `translateY(${deltaY}px)`;
  };
  const finish = (event) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('is-dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if (handle.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    const deltaY = Math.max(0, event.clientY - startY);
    if (deltaY <= threshold) { settle(true); return; }
    panel.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)';
    panel.style.transform = `translateY(${panel.offsetHeight + 40}px)`;
    setTimeout(() => {
      closeFn();
      requestAnimationFrame(() => settle(panel.classList.contains('show')));
    }, 220);
  };
  handle.addEventListener('pointerdown', (event) => {
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
function decorateSpecialTimeName(name) {
  return name ? name.trim() : '';
}
// Changes the visible day when a navigation tab is pressed.
function handleNav(d)  {
  viewDay=d;
  update()
}
/* Tool menu and viewport fitting. */
function setToolHubState(open) {
  const actions=document.querySelector('.top-actions');
  const btn=document.getElementById('btn-menu');
  if (!actions||!btn) return;
  actions.classList.toggle('open',!!open);
  btn.setAttribute('aria-expanded',open?'true':'false');
  const label=open?'關閉工具':'開啟工具';
  btn.setAttribute('aria-label',label);
  btn.setAttribute('title',label);
}
function toggleActionMenu() {
  const actions=document.querySelector('.top-actions');
  setToolHubState(!(actions&&actions.classList.contains('open')));
}
let modalPreviousFocus=null;
document.addEventListener('click',event=>{
  const actions=document.querySelector('.top-actions');
  if (!actions||!actions.classList.contains('open')) return;
  if (!actions.contains(event.target)) setToolHubState(false);
},{capture:true});
document.addEventListener('keydown',event=>{
  if (event.key!=='Escape') return;
  if (document.getElementById('assign-sheet')?.classList.contains('show')) closeAssignSheet();
  else if (document.getElementById('sheet')?.classList.contains('show')) closeModal();
  else if (document.getElementById('editor-confirm-sheet')?.classList.contains('show')) hideEditorDiscardConfirm();
  else if (document.getElementById('debug-panel')?.classList.contains('show')) closeTestPanel();
  else if (document.getElementById('style-panel')?.classList.contains('show')) closeStylePanel();
  else if (document.getElementById('editor-sheet')?.classList.contains('show')) closeEditor();
  else setToolHubState(false);
});
['btn-edit','btn-test','btn-style'].forEach(id=>{
  const btn=document.getElementById(id);
  if (btn) btn.addEventListener('click',()=>setTimeout(()=>setToolHubState(false),80));
});

let activeCountdownIndex=0;
// Countdown cards can be switched with a horizontal swipe on touch devices.
function getCountdownEvents(data=applicationData) {
  return normalizeCountdownEvents(data?.countdownEvents ?? []);
}
function showCountdownEvent(index) {
  const events=getCountdownEvents();
  activeCountdownIndex=(index+events.length)%events.length;
  updateExamCountdown();
}
function updateExamCountdown() {
  const el = document.getElementById('exam-countdown-value');
  const card = document.getElementById('exam-countdown');
  if (!el || !card) return;

  const events=getCountdownEvents();
  if (!events.length) { card.style.display='none'; return }
  card.style.display='';
  activeCountdownIndex=Math.min(activeCountdownIndex,events.length-1);
  const event=events[activeCountdownIndex];
  const label=document.querySelector('.exam-countdown-label');
  const dateLabel=document.querySelector('.exam-countdown-date');
  if (label) label.textContent=event.name;
  if (dateLabel) dateLabel.textContent=formatCountdownEventDate(event);
  const dots=document.getElementById('exam-countdown-dots');
  if (dots) {
    if (events.length<2) {
      dots.hidden=true;
      dots.innerHTML='';
    } else {
      dots.hidden=false;
      dots.innerHTML=events.map((_,index)=>`<span class="exam-countdown-dot${index===activeCountdownIndex?' active':''}"></span>`).join('');
    }
  }
  const toDate=value=> { const [year,month,day]=value.split('-').map(Number); return new Date(year,month-1,day) };
  const examStart = toDate(event.startDate);
  const examEnd = toDate(event.endDate);
  const now = new Date();
  const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const diffStart = Math.round((examStart - today) / 86400000);
  const diffEnd = Math.round((examEnd - today) / 86400000);
  const isSingleDay = event.startDate===event.endDate;

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

const countdownCard=document.getElementById('exam-countdown');
let countdownSwipeStartX=null;
if (countdownCard) {
  countdownCard.addEventListener('pointerdown',event=> {
    countdownSwipeStartX=event.clientX;
    countdownCard.setPointerCapture(event.pointerId)
  });
  countdownCard.addEventListener('pointerup',event=> {
    if (countdownSwipeStartX===null) return;
    const distance=event.clientX-countdownSwipeStartX;
    countdownSwipeStartX=null;
    if (Math.abs(distance)<35||getCountdownEvents().length<2) return;
    showCountdownEvent(activeCountdownIndex+(distance<0?1:-1));
  });
  countdownCard.addEventListener('pointercancel',()=>countdownSwipeStartX=null);
}

// Recomputes the current class, next class, timer, and visible schedule state.
function update()  {
  updateExamCountdown();
  let now = new Date();
  if (window.MANUALLY_TEST)  {
    const h=Math.floor((window.TEST_TIME_SEC||0)/3600),
    m=Math.floor(((window.TEST_TIME_SEC||0)%3600)/60),
    s=(window.TEST_TIME_SEC||0)%60;
    now.setHours(h,m,s,0);
    const simStatus=document.getElementById('sim-status');
    if (simStatus) simStatus.innerText=window.IS_SIMULATING?`${pad2(h)}:${pad2(m)}:${pad2(s)}`:"";
  }
  else  {
    const simStatus=document.getElementById('sim-status');
    if (simStatus) simStatus.innerText="";
  }
  const curDay=window.MANUALLY_TEST?window.TEST_DAY: now.getDay();
  const mins=now.getHours()*60+now.getMinutes();
  const secs=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();
  const week=getWeekType();
  const today=runtimeSchedule[curDay]
  ||[
  ];
  const lastClass=today[today.length-1];
  const isSchoolDay=today.length>0;
  const isDayFinished=isSchoolDay&&!!lastClass&&mins>=parseTime(lastClass.e);
  if (!isDayFinished&&autoAdvancedAfterFinishedDay===curDay)  {
    autoAdvancedAfterFinishedDay=null
  }
  if (isDayFinished&&viewDay===curDay&&autoAdvancedAfterFinishedDay!==curDay)  {
    viewDay=getNextSchoolDay(curDay);
    autoAdvancedAfterFinishedDay=curDay
  }
  let curIdx = -1,
  nxtIdx=-1;
  today.forEach((c,i)=>  {
    if (mins>=parseTime(c.s)&&mins<parseTime(c.e))curIdx=i;
    if (mins<parseTime(c.s)&&nxtIdx===-1)nxtIdx=i
  })
  ;
  const activeBreak=curIdx===-1?(applicationData.breakTimes||[]).find(item=>
    item.name&&item.start&&item.end&&mins>=parseTime(item.start)&&mins<parseTime(item.end)
  ):null;
  document.getElementById('week-display-main').innerHTML=getWeekLabelHtml(week);
  const dot=document.getElementById('dot');
  let st = "載入中…",nt="×",ct="",currentPlace="",nextMeta="",statusDesc="",classLabel="";
  const pw=document.getElementById('progress-wrap'),pb=document.getElementById('progress-bar');
  if (isSchoolDay)  {
    if (activeBreak)  {
      st=decorateSpecialTimeName(activeBreak.name);
      statusDesc="";
      dot.className="status-dot status-wait";
      document.getElementById('timer-group').style.display="flex";
      document.querySelector('.timer-label').innerText="上課";
      const breakStart=parseTime(activeBreak.start)*60,
      breakEnd=parseTime(activeBreak.end)*60,
      diff=breakEnd-secs;
      document.getElementById('timer-val').innerText=`${Math.floor(diff/60)}:${pad2(diff%60)}`;
      pw.style.display="block";
      pw.classList.remove('is-class');
      pb.style.width=Math.min(100,((secs-breakStart)/(breakEnd-breakStart))*100)+'%';
      curIdx=-1;
      nxtIdx=today.findIndex(c=>parseTime(c.s)>=parseTime(activeBreak.end))
    }
    else if (curIdx!==-1)  {
      const info=processSplitName(today[curIdx],
      week);
      st=info.n;
      ct=info.t;
      classLabel=info.label||"";
      currentPlace=today[curIdx].loc||"";
      dot.className="status-dot status-active";
      document.getElementById('timer-group').style.display="flex";
      document.querySelector('.timer-label').innerText="下課";
      const endSec=parseTime(today[curIdx].e)*60,
      startSec=parseTime(today[curIdx].s)*60,
      diff=endSec-secs;
      document.getElementById('timer-val').innerText=`${Math.floor(diff/60)}:${pad2(diff%60)}`;
      const total=endSec-startSec,
      elapsed=secs-startSec;
      pw.style.display="block";
      pw.classList.add('is-class');
      pb.style.width=Math.min(100,(elapsed/total)*100)+'%'}
    else  {
      dot.className="status-dot status-wait";
      const fs=parseTime("08:00"),
      last=lastClass,
      le=last?parseTime(last.e): parseTime("16:45");
      if (mins<fs)  {
        st="尚未開始";
        document.getElementById('timer-group').style.display="none";
        pw.style.display="none"
      }
      else if (mins>=le)  {
        st="放學時間";
        statusDesc="";
        dot.className="status-dot";
        document.getElementById('timer-group').style.display="none";
        pw.style.display="none"
      }
      else  {
        document.getElementById('timer-group').style.display="flex";
        document.querySelector('.timer-label').innerText="上課";
        st="下課";
        statusDesc="";
        if (nxtIdx!==-1)  {
          const ns=parseTime(today[nxtIdx].s)*60,
          diff=ns-secs;
          document.getElementById('timer-val').innerText=`${Math.floor(diff/60)}:${pad2(diff%60)}`;
          const pe=nxtIdx>0?parseTime(today[nxtIdx-1].e)*60: parseTime("08:00")*60,
          bt=ns-pe,
          be=secs-pe;
          pw.style.display="block";
          pw.classList.remove('is-class');
          pb.style.width=Math.min(100,(be/bt)*100)+'%'}
        else  {
          pw.style.display="none"
        }
      }
    }
    if (nxtIdx!==-1)  {
      const info=processSplitName(today[nxtIdx],
      week);
      nt=info.n;
      nextMeta=[today[nxtIdx].s,info.t,today[nxtIdx].loc].filter(Boolean).join(' · ')
    }
    else  {
      nt=(curDay===5)?"週末愉快":"再見";
      nextMeta=""
    }
  }
  else  {
    st="今日無課";
    statusDesc="";
    nt="週一見";
    dot.className="status-dot";
    document.getElementById('timer-group').style.display="none";
    pw.style.display="none";
    nextMeta=""
  }
  const nowName=document.getElementById('now-name');
  const nowStack=document.querySelector('.now-stack');
  const timerGroup=document.getElementById('timer-group');
  const compactStatus=!timerGroup||timerGroup.style.display==='none';
  const statusLabel=document.getElementById('status-label');
  if (statusLabel) statusLabel.innerText=dot.classList.contains('status-active')?'上課中':dot.classList.contains('status-wait')?(timerGroup&&timerGroup.style.display!=='none'?'休息中':'等待中'):'無課';
  nowName.innerText=st;
  const dashboard=document.querySelector('.dashboard');
  if (dashboard) {
    const activeClass=(curIdx>=0?today[curIdx]:null);
    const upcomingClass=(nxtIdx>=0?today[nxtIdx]:null);
    dashboard.style.setProperty('--current-class-color',getClassColor(activeClass?.key||upcomingClass?.key||''));
  }
  nowName.classList.toggle('is-status',compactStatus);
  if (nowStack) nowStack.classList.toggle('is-status',compactStatus);
  const nowTeacher=document.getElementById('now-teacher');
  nowTeacher.innerText=ct||"";
  nowTeacher.classList.toggle('show',!!ct);
  const nowPlace=document.getElementById('now-place');
  nowPlace.innerText=currentPlace||"";
  nowPlace.classList.toggle('show',!!currentPlace);
  const nowClassLabel=document.getElementById('now-class-label');
  if (nowClassLabel) {
    nowClassLabel.innerHTML=classLabel||"";
    nowClassLabel.classList.toggle('show',!!classLabel);
  }
  const metaRow=document.querySelector('.now-meta-row');
  if (metaRow) metaRow.style.display=(!compactStatus&&(ct||currentPlace||classLabel))?'flex':'none';
  fitNowTitleText();
  document.getElementById('next-name').innerText=nt;
  const nextClass=nxtIdx>=0?today[nxtIdx]:null;
  const nextInfo=nextClass?processSplitName(nextClass,week):null;
  document.getElementById('next-meta-text').innerText=nextClass?
    [nextClass.s,nextInfo?.t,nextClass.loc].filter(Boolean).join(' · '):"";
  const liveStateKey=`${window.MANUALLY_TEST?'T':'R'}-${curDay}-${week}-${curIdx}-${nxtIdx}-${activeBreak?activeBreak.name:''}-${isDayFinished}-${viewDay}`;
  if (lastListKey!==liveStateKey)  {
    renderList(week,curIdx,nxtIdx,curDay,isDayFinished);
    lastListKey=liveStateKey
  }
}

// Set the instant the user touches or scrolls the list (see initScheduleScrollClamp),
// not only once a 'scroll' event actually lands — iOS Safari can delay that event past
// when a pending alignment below already fired, which is what read as the list fighting
// the user's finger. Any pending alignment checks this and backs off instead of snapping
// the list back under them.
let userScrolledDuringAlign = false;

function keepActiveClassVisible(list,isDayFinished,scrollKey) {
  if (scrollKey===lastAutoScrollKey) return;
  lastAutoScrollKey=scrollKey;
  userScrolledDuringAlign=false;

  const activeRow = list.querySelector('.is-now') || list.querySelector('.is-next');

  if (isDayFinished || !activeRow) {
    clearListAutoAlignedTop(list);
    setListAutoScrollSpace(list,0);
    requestAnimationFrame(() => list.scrollTo({
      top:0,
      behavior:'auto'
    }));
    return
  }

  // One pass, one frame after layout: the row entrance animation only transforms
  // opacity/transform/filter (never layout-affecting properties), so activeRow.offsetTop
  // is already correct here and doesn't need to be re-polled on a timer afterwards.
  requestAnimationFrame(() => {
    if (userScrolledDuringAlign) return;
    const targetTop=Math.max(0,activeRow.offsetTop);
    const reserved=parseFloat(list.dataset.autoScrollSpace||'0')||0;
    const naturalMax=Math.max(0,getNaturalListMaxScroll(list)-reserved);
    const neededSpace=Math.max(0,targetTop-naturalMax);

    setListAutoScrollSpace(list,neededSpace);
    setListAutoAlignedTop(list,targetTop);
    void list.offsetHeight;
    allowProgrammaticListScroll=true;
    list.scrollTo({top:targetTop,behavior:'auto'});
    requestAnimationFrame(() => {
      allowProgrammaticListScroll=false
    })
  })
}

// Adds hidden bottom room only when auto-scroll needs to align a late class.
function setListAutoScrollSpace(list,space) {
  list.dataset.autoScrollSpace=String(Math.max(0,space));
  list.style.setProperty('--auto-scroll-space',`${Math.max(0,space)}px`)
}
function setListAutoAlignedTop(list,top) {
  list.dataset.autoAlignedTop=String(Math.max(0,top))
}
function clearListAutoAlignedTop(list) {
  if (!list) return;
  delete list.dataset.autoAlignedTop;
  /* Only called from keepActiveClassVisible when the day is finished or
     there's no active row — never from a manual scroll/touch gesture. */
  setListAutoScrollSpace(list,0);
}

// Real content boundary for manual scrolling.
function getNaturalListMaxScroll(list) {
  return Math.max(0,list.scrollHeight-list.clientHeight)
}

// Prevents manual scrolling from being restricted below what the auto-scroll system already
// allows. Single source of truth for the scroll ceiling: the user is always allowed to scroll
// at least as far as auto-scroll's own target, so the two systems never fight each other.
//
// Touch devices fire many 'scroll' events per frame during momentum/rubber-band deceleration
// at the bottom edge. Correcting scrollTop synchronously on every one of those events fights
// the browser's own elastic-bounce animation frame-by-frame, which is what reads as flicker.
// Coalescing to a single correction per animation frame (and tolerating a couple of px of
// native overscroll) keeps the same ceiling without contesting the bounce.
function clampManualListScroll() {
  if (allowProgrammaticListScroll)return;
  userScrolledDuringAlign=true;
  if (clampScrollFrame) return;
  clampScrollFrame=requestAnimationFrame(()=>{
    clampScrollFrame=0;
    const list=document.getElementById('schedule-list');
    if (!list)return;
    const aligned=parseFloat(list.dataset.autoAlignedTop||'');
    const max=Math.max(getNaturalListMaxScroll(list),Number.isFinite(aligned)?aligned:0);
    const overshoot=list.scrollTop-max;

    if (overshoot>2) {
      list.scrollTop=max
    }
  })
}

// Closes the class detail modal.
function setElementVisible(id,visible) {
  const element=document.getElementById(id);
  if (element) element.classList.toggle('show',visible);
  return element;
}
function setOverlayVisible(overlayId,panelId,visible,bodyClass) {
  const overlay=setElementVisible(overlayId,visible);
  setElementVisible(panelId,visible);
  if (overlay) overlay.setAttribute('aria-hidden',visible?'false':'true');
  if (bodyClass) document.body.classList.toggle(bodyClass,visible);
}
function closeModal()  {
  setOverlayVisible('overlay','sheet',false,'modal-open');
  if (modalPreviousFocus&&typeof modalPreviousFocus.focus==='function') modalPreviousFocus.focus();
  modalPreviousFocus=null
}
function setSplitWeekClass(id,subject,teacher) {
  const target=document.getElementById(id);
  if (!target) return;
  target.replaceChildren(document.createTextNode(subject||''));
  const teacherText=document.createElement('div');
  teacherText.style.cssText='font-size:11px;font-weight:400;color:var(--sub)';
  teacherText.textContent=teacher||'';
  target.appendChild(teacherText)
}
// Opens the class detail modal and fills in occurrence/location details.
function openModal(c)  {
  modalPreviousFocus=document.activeElement;
  const week=getWeekType();
  const terms=c.isSplit?c.n.split('/').map(t=>t.trim()):[c.n];
  const teachers=c.isSplit?c.t.split('/').map(t=>t.trim()):[c.t];
  let count = 0,
  occHtml="";
  const locCard=document.getElementById('m-location-card');
  const statGrid=locCard.closest('.stat-grid');
  if (c.loc)  {
    locCard.style.display='block';
    document.getElementById('m-location-val').innerText=c.loc;
    statGrid.classList.add('has-location')
  }
  else  {
    locCard.style.display='none';
    statGrid.classList.remove('has-location')
  }
  [
  1,
  2,
  3,
  4,
  5
  ].forEach(d=>  {
    runtimeSchedule[d].forEach((item,idx)=>  {
      const match=c.isSplit?terms.some(t=>item.n.includes(t)):(item.n===c.n);
      if (match)  {
        count++;
        occHtml+=`<div class="occ-row"><span class="occ-row-day">週${dayNames[d]}</span><div class="occ-row-meta"><div class="occ-row-period">第 ${idx+1} 節</div><div class="occ-row-time">${esc(item.s)} – ${esc(item.e)}</div></div></div>`
      }
    })
  })
  ;
  const sc=document.getElementById('split-info-card');
  if (c.isSplit)  {
    sc.style.display="block";
    const idx=(week==="單")?0: 1;
    setSplitWeekClass('this-week-class',terms[idx],teachers[idx]||teachers[0]);
    setSplitWeekClass('next-week-class',terms[1-idx],teachers[1-idx]||teachers[0]);
    document.getElementById('m-type-val').innerText="雙週"
  }
  else  {
    sc.style.display="none";
    document.getElementById('m-type-val').innerText="固定"
  }
  const info=processSplitName(c,week);
  document.getElementById('m-title').innerText=info.n;
  document.getElementById('m-teacher').innerText="教師　"+info.t;
  document.getElementById('m-count').innerText=count+" 節";
  document.getElementById('m-occ-list').innerHTML=occHtml||`<div class="occ-row"><span class="occ-row-day">×</span><div class="occ-row-meta"><div class="occ-row-period">無排課</div></div></div>`;
  setOverlayVisible('overlay','sheet',true,'modal-open');
}
let editorBaselineSnapshot ='';

// ---- js/editor-backup.js ----
// Reads the editor form and converts it into the app data shape.
function collectEditorFormState()  {
  const newDB=  {
  },
  newLoc=  {
  };
  document.querySelectorAll('#teacher-list .teacher-card').forEach(card=>  {
    const key=(card.dataset.origKey||'').trim(),
    subject=card.querySelector('.tc-subject').value.trim(),
    teacher=card.querySelector('.tc-teacher').value.trim(),
    location=card.querySelector('.tc-location').value.trim();
    if (key&&subject)  {
      newDB[key] =[
      subject,
      teacher,
      location
      ];
      newLoc[key] =location
    }
  })
  ;
  const newWeekly=  {
  };
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(row=>  {
    const d=parseInt(row.dataset.day,10);
    newWeekly[d] =Array.from(row.querySelectorAll('.period-select')).map(sel=>sel.value)
  })
  ;
  const newBells=[
  ];
  document.querySelectorAll('#bell-list .bell-row').forEach(row=>  {
    const s=row.querySelector('.bell-start').value,
    e=row.querySelector('.bell-end').value;
    if (s&&e)newBells.push([
    s,
    e
    ])
  })
  ;
  const newBreaks=[];
  document.querySelectorAll('#break-list .break-row').forEach(row=> {
    const name=row.querySelector('.break-name').value.trim(),
    start=row.querySelector('.break-start').value,
    end=row.querySelector('.break-end').value;
    if (name&&start&&end)newBreaks.push({name,start,end})
  });
  const reverseWeek=document.getElementById('toggle-reverse').classList.contains('on');
  const countdownEvents=Array.from(document.querySelectorAll('#countdown-event-list .countdown-event-row')).map(row=>normalizeCountdownEvent({
    name:row.querySelector('.countdown-event-name')?.value,
    startDate:row.querySelector('.countdown-event-start')?.value,
    endDate:row.querySelector('.countdown-event-end')?.value
  })).filter(Boolean);
  const normalizedCountdownEvents=normalizeCountdownEvents(countdownEvents);
  const proAccent=normalizeProAccent(applicationData.proAccent);
  const derivedProColors=deriveProSupportColors(proAccent);
  const proSecondary=normalizeProSecondary(applicationData.proSecondary||derivedProColors.secondary);
  const proTertiary=derivedProColors.tertiary;
  return  {
    teacherDB: newDB, teacherOrder:Array.from(document.querySelectorAll('#teacher-list .teacher-card')).map(card=>(card.dataset.origKey||'').trim()).filter(Boolean), locationDB: newLoc, weeklySchedule: newWeekly, bellTimes: newBells,
    breakTimes: newBreaks, countdownEvents:normalizedCountdownEvents, reverseWeek, proAccent, proSecondary, proTertiary, styleSlots:normalizeStyleSlots(applicationData.styleSlots)
  }
}
// Creates a stable snapshot so the app can detect unsaved editor changes.
function editorFormSnapshotString()  {
  const s=collectEditorFormState();
  const tcd=[
  ];
  document.querySelectorAll('#teacher-list .teacher-card').forEach(card=>  {
    tcd.push([
    card.dataset.origKey||'',
    card.querySelector('.tc-subject').value,
    card.querySelector('.tc-teacher').value,
    card.querySelector('.tc-location').value
    ])
  })
  ;
  const brd=[
  ];
  document.querySelectorAll('#bell-list .bell-row').forEach(row=>  {
    brd.push([
    row.querySelector('.bell-start').value,
    row.querySelector('.bell-end').value
    ])
  })
  ;
  const bkd=[];
  document.querySelectorAll('#break-list .break-row').forEach(row=> {
    bkd.push([
      row.querySelector('.break-name').value,
      row.querySelector('.break-start').value,
      row.querySelector('.break-end').value,
      ''
    ])
  });
  return JSON.stringify(  {
    reverseWeek: s.reverseWeek, countdownEvents:s.countdownEvents, proAccent:s.proAccent, proSecondary:s.proSecondary, proTertiary:s.proTertiary, styleSlots:s.styleSlots, bellTimes: s.bellTimes, breakTimes: s.breakTimes, bellRowsDraft: brd, breakRowsDraft: bkd, weeklySchedule: s.weeklySchedule, teacherDB: s.teacherDB, teacherOrder:s.teacherOrder, teacherCardsDraft: tcd
  })
}
// Checks whether the editor has unsaved changes.
function isEditorDirty()  {
  if (!document.getElementById('editor-sheet').classList.contains('show'))return false;
  return editorFormSnapshotString()!==editorBaselineSnapshot
}
let pendingTransferAction=null;
function confirmExportOverwrite() {
  hideEditorDiscardConfirm();
  exportEditorSettings()
}
function runTransferAction(action) {
  if (action==='export') {
    const text=document.getElementById('settings-transfer-text');
    if (text?.value.trim()) {
      setEditorConfirmContent('覆寫匯出內容？','匯出會覆寫目前文字欄位中的內容。','目前欄位已有設定文字，確定要以新的匯出內容取代嗎？','覆寫並匯出',confirmExportOverwrite,'取消');
      showEditorConfirmSheet();
      return
    }
    exportEditorSettings();
  }
  else previewImportEditorSettings()
}
function requestTransferAction(action) {
  if (!isEditorDirty()) {
    runTransferAction(action);
    return
  }
  pendingTransferAction=action;
  const label=action==='export'?'匯出':'匯入';
  setEditorConfirmContent(
    `要先儲存目前設定嗎？`,
    `目前有尚未儲存的變更。請選擇是否先儲存再${label}。`,
    '',
    `儲存後${label}`,
    ()=> {
      saveEditor()
    },
    `不儲存直接${label}`,
    {cancelHandler:()=> {
      const nextAction=pendingTransferAction;
      pendingTransferAction=null;
      hideEditorDiscardConfirm();
      if (nextAction==='export') {
        exportEditorSettings(editorBaselineData||normalizeSettingsData(applicationData))
      } else {
        runTransferAction(nextAction)
      }
    },extraLabel:'取消',extraHandler:()=> {
      pendingTransferAction=null;
      hideEditorDiscardConfirm()
    }}
  );
  showEditorConfirmSheet()
}
function cloneSettingsData(data) {
  return JSON.parse(JSON.stringify(data))
}
// ---- v2 transfer format ----
// A much shorter, denser format than v1: redundant fields (locationDB, which
// always mirrors teacherDB's 3rd column) are dropped, remaining structures
// are flattened into positional arrays (removing per-item key names), the
// payload is compressed with raw DEFLATE (no zlib header/checksum), and the
// compressed bytes are encoded with a 91-symbol printable alphabet instead
// of Base64 - Base64 spends 4 characters per 3 bytes (~1.33 chars/byte),
// while this alphabet spends under 1.23 bytes/char, so encoded text is
// roughly a quarter shorter for the same compressed bytes. The wrapping
// marker is a short, human-readable pair of bracketed start/end tags
// instead of the old ~90-character banner text, so a backup's boundaries
// are still obvious to a user scanning or pasting the text.
const TRANSFER_MAGIC_V2='[ORBIT]';
const TRANSFER_MAGIC_V2_END='[/ORBIT]';
const BASE91_ALPHABET="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;<=>?@[]^_`{|}~";
const BASE91_DECODE_MAP=Object.fromEntries([...BASE91_ALPHABET].map((char,index)=>[char,index]));
function base91Encode(bytes) {
  let b=0,n=0,out='';
  for (let i=0;i<bytes.length;i++) {
    b|=bytes[i]<<n;
    n+=8;
    if (n>13) {
      let v=b&8191;
      if (v>88) { b>>=13; n-=13; }
      else { v=b&16383; b>>=14; n-=14; }
      out+=BASE91_ALPHABET[v%91]+BASE91_ALPHABET[Math.floor(v/91)]
    }
  }
  if (n>0) {
    out+=BASE91_ALPHABET[b%91];
    if (n>7||b>90) out+=BASE91_ALPHABET[Math.floor(b/91)]
  }
  return out
}
function base91Decode(str) {
  const bytes=[];
  let b=0,n=0,v=-1;
  for (let i=0;i<str.length;i++) {
    const c=BASE91_DECODE_MAP[str[i]];
    if (c===undefined) continue;
    if (v<0) { v=c; continue }
    v+=c*91;
    b|=v<<n;
    n+=(v&8191)>88?13:14;
    while (n>=8) { bytes.push(b&255); b>>=8; n-=8 }
    v=-1
  }
  if (v>=0) bytes.push((b|(v<<n))&255);
  return Uint8Array.from(bytes)
}
function encodeTransferPayloadV2(data) {
  const teacherEntries=Object.entries(data.teacherDB||{}).map(([key,value])=>[key,value[0]||'',value[1]||'',value[2]||'']);
  const weeklyDays=[0,1,2,3,4,5,6].map(day=>(data.weeklySchedule||{})[day]||[]);
  const breakEntries=(data.breakTimes||[]).map(item=>[item.name||'',item.start||'',item.end||'']);
  const countdownEntries=(data.countdownEvents||[]).map(item=>[item.name||'',item.startDate||'',item.endDate||'']);
  const styleSlotEntries=(data.styleSlots||[]).map(slot=>[slot.name||'',slot.primary||'',slot.secondary||'']);
  return [data.teacherOrder||[],teacherEntries,weeklyDays,data.bellTimes||[],breakEntries,countdownEntries,data.reverseWeek?1:0,data.proAccent,data.proSecondary,data.proTertiary,styleSlotEntries,data.geminiApiKey||'']
}
function decodeTransferPayloadV2(array) {
  const [teacherOrder,teacherEntries,weeklyDays,bellTimes,breakEntries,countdownEntries,reverseWeekFlag,proAccent,proSecondary,proTertiary,styleSlotEntries,geminiApiKey]=array;
  const teacherDB={},locationDB={};
  (teacherEntries||[]).forEach(([key,subject,teacher,location])=> {
    teacherDB[key]=[subject,teacher,location];
    locationDB[key]=location
  });
  const weeklySchedule={};
  [0,1,2,3,4,5,6].forEach(day=> { weeklySchedule[day]=(weeklyDays||[])[day]||[] });
  const breakTimes=(breakEntries||[]).map(([name,start,end])=>({name,start,end}));
  const countdownEvents=(countdownEntries||[]).map(([name,startDate,endDate])=>({name,startDate,endDate}));
  const styleSlots=(styleSlotEntries||[]).map(([name,primary,secondary])=>({name,primary,secondary}));
  return {
    teacherDB,teacherOrder:teacherOrder||[],locationDB,weeklySchedule,bellTimes:bellTimes||[],breakTimes,countdownEvents,
    reverseWeek:!!reverseWeekFlag,proAccent,proSecondary,proTertiary,styleSlots,geminiApiKey,
    __orbit:{app:ORBIT_APP_ID,schema:ORBIT_STORAGE_SCHEMA}
  }
}
async function encodeTransferDataV2(data) {
  const raw=JSON.stringify(encodeTransferPayloadV2(data));
  const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
  return TRANSFER_MAGIC_V2+base91Encode(bytes)+TRANSFER_MAGIC_V2_END
}
async function decodeTransferDataV2(value) {
  const encoded=value.slice(TRANSFER_MAGIC_V2.length,-TRANSFER_MAGIC_V2_END.length).trim();
  if (!encoded) throw new Error('請貼上 Orbit Color 課表設定備份。');
  const stream=new Blob([base91Decode(encoded)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const array=JSON.parse(await new Response(stream).text());
  if (!Array.isArray(array)) throw new Error('請貼上 Orbit Color 課表設定備份。');
  return decodeTransferPayloadV2(array)
}
async function encodeTransferData(data) {
  if (typeof CompressionStream!=='function') throw new Error('此裝置不支援壓縮匯出。');
  return encodeTransferDataV2(data)
}
async function decodeTransferData(text) {
  const value=String(text||'').trim();
  if (!value.startsWith(TRANSFER_MAGIC_V2)||!value.endsWith(TRANSFER_MAGIC_V2_END)) throw new Error('請貼上 Orbit Color 課表設定備份。');
  if (typeof DecompressionStream!=='function') throw new Error('此裝置不支援壓縮匯入。');
  return decodeTransferDataV2(value)
}
function normalizeSettingsData(raw,{requireMarker=false}={}) {
  if (!raw || typeof raw !== 'object') throw new Error('設定文字必須是 JSON 物件。');
  const marker=raw.__orbit;
  if (requireMarker && (!marker || marker.app!==ORBIT_APP_ID || marker.schema!==ORBIT_STORAGE_SCHEMA)) {
    throw new Error('設定檔不是由目前版本的 Orbit_Color 建立。');
  }

  const source=raw;
  const required=['teacherDB','locationDB','weeklySchedule','bellTimes'];
  required.forEach(key=> {
    if (!(key in source)) throw new Error(`設定文字缺少「${key}」。`);
  });

  if (!source.teacherDB || typeof source.teacherDB !== 'object' || Array.isArray(source.teacherDB)) throw new Error('teacherDB 必須是物件。');
  if (!source.locationDB || typeof source.locationDB !== 'object' || Array.isArray(source.locationDB)) throw new Error('locationDB 必須是物件。');
  if (!source.weeklySchedule || typeof source.weeklySchedule !== 'object' || Array.isArray(source.weeklySchedule)) throw new Error('weeklySchedule 必須是物件。');
  if (!Array.isArray(source.bellTimes)) throw new Error('bellTimes 必須是陣列。');
  if (source.breakTimes !== undefined && !Array.isArray(source.breakTimes)) throw new Error('breakTimes 必須是陣列。');
  if (source.countdownEvents !== undefined && !Array.isArray(source.countdownEvents)) throw new Error('countdownEvents 必須是陣列。');
  if (Object.values(source.teacherDB).some(value => !Array.isArray(value))) throw new Error('teacherDB 必須是每個項目都是 [科目, 老師, 教室] 陣列。');
  if (Object.values(source.weeklySchedule).some(value => !Array.isArray(value))) throw new Error('weeklySchedule 必須是每一天都是陣列。');

  const teacherDB={};
  Object.entries(source.teacherDB).forEach(([key,value])=> {
    if (!key || !Array.isArray(value)) return;
    const cleanKey=String(key).trim();
    if (!cleanKey) return;
    teacherDB[cleanKey]=[String(value[0]||''),String(value[1]||''),String(value[2]||'')];
  });

  const locationDB={};
  Object.entries(source.locationDB).forEach(([key,value])=> {
    const cleanKey=String(key).trim();
    if (!cleanKey) return;
    if (teacherDB[cleanKey]) locationDB[cleanKey]=String(value||'');
  });

  const weeklySchedule={};
  [0,1,2,3,4,5,6].forEach(day=> {
    const row=source.weeklySchedule[day]||source.weeklySchedule[String(day)]||[];
    if (!Array.isArray(row)) {
      weeklySchedule[day]=[];
      return;
    }
    weeklySchedule[day]=row.map(item=>String(item||'')).filter(item=>item && teacherDB[item] ? item : item === '');
  });

  if (Object.values(weeklySchedule).some(row=>row.some(key=>key && !teacherDB[key]))) throw new Error('排課資料包含不存在的教師代碼。');
  if (source.bellTimes.some(item=>!Array.isArray(item)||!isValidTimeRange(String(item[0]||''),String(item[1]||'')))) throw new Error('節次時間必須是有效的開始與結束時間。');

  const bellTimes=source.bellTimes.map(item=>[String(item[0]),String(item[1])]);
  const breakTimes=sanitizeBreakTimes(bellTimes, source.breakTimes);
  const countdownEvents=normalizeCountdownEvents(source.countdownEvents);
  const teacherOrder=Array.isArray(source.teacherOrder)?source.teacherOrder.map(String).filter(key=>teacherDB[key]).filter((key,index,self)=>self.indexOf(key)===index):Object.keys(teacherDB);
  Object.keys(teacherDB).forEach(key=>{if(!teacherOrder.includes(key))teacherOrder.push(key)});

  validateTimeIntervals(bellTimes,breakTimes);

  return {
    teacherDB,
    teacherOrder,
    locationDB,
    weeklySchedule,
    bellTimes,
    breakTimes,
    countdownEvents,
    reverseWeek:typeof source.reverseWeek==='boolean'?source.reverseWeek:REVERSE_WEEK_LOGIC_DEFAULT,
    geminiApiKey:Object.prototype.hasOwnProperty.call(source,'geminiApiKey')?String(source.geminiApiKey||''):getStoredGeminiApiKey(),
    proAccent:normalizeProAccent(source.proAccent),
    proSecondary:normalizeProSecondary(source.proSecondary),
    proTertiary:normalizeProTertiary(source.proTertiary),
    styleSlots:normalizeStyleSlots(source.styleSlots)
  };
}
function settingsDataForExport() {
  sortEditorPeriodsByTime();
  return {
    ...normalizeSettingsData({...collectEditorFormState(),__orbit:{app:ORBIT_APP_ID,schema:ORBIT_STORAGE_SCHEMA}}),
    __orbit:{app:ORBIT_APP_ID,schema:ORBIT_STORAGE_SCHEMA}
  }
}
function setTransferStatus(message,isError=false) {
  const status=document.getElementById('settings-transfer-status');
  if (!status) return;
  status.textContent=message||'';
  status.style.color=isError?'#ff6b6b':'var(--sub)'
}
async function copyTransferText(text) {
  if (navigator.clipboard&&window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return
    } catch (error) {
    }
  }
  const helper=document.createElement('textarea');
  helper.value=text;
  helper.style.position='fixed';
  helper.style.opacity='0';
  document.body.appendChild(helper);
  helper.select();
  try {
    if (!document.execCommand('copy')) throw new Error('無法自動複製匯出內容。');
  } finally {
    helper.remove()
  }
}
async function exportEditorSettings(data=settingsDataForExport()) {
  try {
    const text=document.getElementById('settings-transfer-text');
    text.value=await encodeTransferData(data);
    await copyTransferText(text.value);
    text.focus();
    text.select();
    setTransferStatus('已產生並複製匯出內容。')
  } catch (error) {
    setTransferStatus('匯出失敗：無法建立設定備份。',true)
  }
}
function formatDiffValue(value) {
  return value ? String(value) : '（空白）'
}
function formatClassRef(key,data) {
  if (!key) return '（空）';
  const info=(data.teacherDB||{})[key]||[];
  const subject=info[0]||'';
  const teacher=info[1]||'';
  const details=[subject,teacher].filter(Boolean).join(' / ');
  return details||'（未命名課程）'
}
function pushDiff(lines,title,items) {
  if (!items.length) return;
  lines.push(`${title}:`);
  items.forEach(item=>lines.push(`- ${item}`))
}
function dayDiffLabel(day) {
  const labels={0:'週日',1:'週一',2:'週二',3:'週三',4:'週四',5:'週五',6:'週六'};
  return labels[day]||`第 ${day} 天`
}
function describeSettingsDiff(current,next,{isImport=false}={}) {
  const lines=[];
  const teacherItems=[];
  const sortByLabel=(data)=>(a,b)=>formatClassRef(a,data).localeCompare(formatClassRef(b,data),'zh-Hant');
  const teacherKeys=[...new Set(Object.keys(current.teacherDB||{}).concat(Object.keys(next.teacherDB||{})))].sort(sortByLabel(next.teacherDB?next:current));
  teacherKeys.forEach(key=> {
    const before=(current.teacherDB||{})[key];
    const after=(next.teacherDB||{})[key];
    if (!before && after) teacherItems.push(`新增 ${formatClassRef(key,next)}`);
    else if (before && !after) teacherItems.push(`移除 ${formatClassRef(key,current)}`);
    else if (before && after) {
      if ((before[0]||'')!==(after[0]||'')) teacherItems.push(`${formatClassRef(key,next)} 科目：${formatDiffValue(before[0])} -> ${formatDiffValue(after[0])}`);
      if ((before[1]||'')!==(after[1]||'')) teacherItems.push(`${formatClassRef(key,next)} 老師：${formatDiffValue(before[1])} -> ${formatDiffValue(after[1])}`);
    }
  });
  pushDiff(lines,'課程與老師',teacherItems);

  const locationItems=[];
  const locationKeys=[...new Set(Object.keys(current.locationDB||{}).concat(Object.keys(next.locationDB||{})))].sort(sortByLabel(next.teacherDB?next:current));
  locationKeys.forEach(key=> {
    const before=(current.locationDB||{})[key]||'';
    const after=(next.locationDB||{})[key]||'';
    const data=after?next:current;
    if (before!==after) locationItems.push(`${formatClassRef(key,data)} 地點：${formatDiffValue(before)} -> ${formatDiffValue(after)}`)
  });
  pushDiff(lines,'上課地點',locationItems);

  const bellItems=[];
  const bellTotal=Math.max((current.bellTimes||[]).length,(next.bellTimes||[]).length);
  for (let i=0;i<bellTotal;i++) {
    const before=(current.bellTimes||[])[i];
    const after=(next.bellTimes||[])[i];
    const beforeText=before?`${before[0]}-${before[1]}`:'（無）';
    const afterText=after?`${after[0]}-${after[1]}`:'（無）';
    if (beforeText!==afterText) bellItems.push(`第 ${i+1} 節：${beforeText} -> ${afterText}`)
  }
  pushDiff(lines,'節次時間',bellItems);

  const breakItems=[];
  const breakTotal=Math.max((current.breakTimes||[]).length,(next.breakTimes||[]).length);
  for (let i=0;i<breakTotal;i++) {
    const before=(current.breakTimes||[])[i];
    const after=(next.breakTimes||[])[i];
    const beforeText=before?`${before.name} ${before.start}-${before.end}`:'（無）';
    const afterText=after?`${after.name} ${after.start}-${after.end}`:'（無）';
    if (beforeText!==afterText) breakItems.push(`休息時段 ${i+1}：${beforeText} -> ${afterText}`)
  }
  pushDiff(lines,'休息時段',breakItems);

  const scheduleItems=[];
  [1,2,3,4,5,6,0].forEach(day=> {
    const beforeRow=(current.weeklySchedule||{})[day]||[];
    const afterRow=(next.weeklySchedule||{})[day]||[];
    const total=Math.max(beforeRow.length,afterRow.length);
    for (let i=0;i<total;i++) {
      const before=beforeRow[i]||'';
      const after=afterRow[i]||'';
      if (before!==after) scheduleItems.push(`${dayDiffLabel(day)}第 ${i+1} 節：${formatClassRef(before,current)} -> ${formatClassRef(after,next)}`)
    }
  });
  pushDiff(lines,'課表內容',scheduleItems);

  const currentCountdownEvents=getCountdownEvents(current);
  const nextCountdownEvents=getCountdownEvents(next);
  const countdownItems=[];
  const eventText=event=>`${event.name} (${formatCountdownEventDate(event)})`;
  const matchedCurrent=new Set();
  nextCountdownEvents.forEach(event=>{
    const exact=currentCountdownEvents.findIndex((item,index)=>
      !matchedCurrent.has(index)&&item.name===event.name&&item.startDate===event.startDate&&item.endDate===event.endDate);
    if (exact!==-1) {
      matchedCurrent.add(exact);
      return
    }
    const changed=currentCountdownEvents.findIndex((item,index)=>
      !matchedCurrent.has(index)&&item.name===event.name);
    if (changed!==-1) {
      matchedCurrent.add(changed);
      countdownItems.push(`活動：${eventText(currentCountdownEvents[changed])} -> ${eventText(event)}`);
    }
    else countdownItems.push(`新增活動：${eventText(event)}`)
  });
  currentCountdownEvents.forEach((event,index)=>{
    if (!matchedCurrent.has(index)) countdownItems.push(`移除活動：${eventText(event)}`)
  });
  pushDiff(lines,'倒數活動',countdownItems);
  if (!!current.reverseWeek!==!!next.reverseWeek) lines.push(`單雙週對調：${current.reverseWeek?'開啟':'關閉'} -> ${next.reverseWeek?'開啟':'關閉'}`);
  // Never print the key itself here — this text can end up on screen or pasted elsewhere.
  if ((current.geminiApiKey||'')!==(next.geminiApiKey||'')) lines.push(next.geminiApiKey?'Gemini API 金鑰：更新為匯入的金鑰':'Gemini API 金鑰：清除');
  const currentProAccent=normalizeProAccent(current.proAccent);
  const nextProAccent=normalizeProAccent(next.proAccent);
  const describeColorChange=(label,before,after)=>isImport?`${label}（目前）：${before} -> ${label}（匯入）：${after}`:`${label}：${before} -> ${after}`;
  const importedStyleItems=[];
  if (currentProAccent!==nextProAccent) {
    if (isImport) importedStyleItems.push(`主色：${currentProAccent} -> 主色（匯入）：${nextProAccent}`);
    else lines.push(describeColorChange('主色',currentProAccent,nextProAccent))
  }
  const currentProSecondary=normalizeProSecondary(current.proSecondary);
  const nextProSecondary=normalizeProSecondary(next.proSecondary);
  if (currentProSecondary!==nextProSecondary) {
    if (isImport) importedStyleItems.push(`次色：${currentProSecondary} -> 次色（匯入）：${nextProSecondary}`);
    else lines.push(describeColorChange('次色',currentProSecondary,nextProSecondary))
  }
  if (isImport) pushDiff(lines,'目前樣式',importedStyleItems);
  const currentSlots=normalizeStyleSlots(current.styleSlots);
  const nextSlots=normalizeStyleSlots(next.styleSlots);
  const styleSlotItems=[];
  currentSlots.forEach((slot,index)=> {
    const nextSlot=nextSlots[index];
    if (slot.name===nextSlot.name&&slot.primary===nextSlot.primary&&slot.secondary===nextSlot.secondary) return;
    const slotLabel=`樣式 ${index+1}`;
    if (!slot.name&&nextSlot.name) styleSlotItems.push(`新增${slotLabel}「${nextSlot.name}」：主色 ${nextSlot.primary}，次色 ${nextSlot.secondary}`);
    else if (slot.name&&!nextSlot.name) styleSlotItems.push(`移除${slotLabel}「${slot.name}」：主色 ${slot.primary}，次色 ${slot.secondary}`);
    else if (isImport) styleSlotItems.push(`${slotLabel}「${slot.name||'未命名'}」 -> 「${nextSlot.name||'未命名'}」：主色（目前）${slot.primary} -> 主色（匯入）${nextSlot.primary}，次色（目前）${slot.secondary} -> 次色（匯入）${nextSlot.secondary}`)
    else styleSlotItems.push(`${slotLabel}「${slot.name||'未命名'}」 -> 「${nextSlot.name||'未命名'}」：主色 ${slot.primary} -> ${nextSlot.primary}，次色 ${slot.secondary} -> ${nextSlot.secondary}`)
  });
  pushDiff(lines,'個人樣式',styleSlotItems);
  const maxLines=70;
  if (lines.length>maxLines) {
    const hidden=lines.length-maxLines;
    return lines.slice(0,maxLines).join('\n')+`\n...還有 ${hidden} 項變更未顯示。`
  }
  return lines.length?lines.join('\n'):'沒有變更。'
}
// Import is decoded and previewed first; confirmation is required before saving.
async function previewImportEditorSettings() {
  const text=document.getElementById('settings-transfer-text');
  try {
    if (text.value.trim().toLowerCase()==='reset') {
      localStorage.clear();
      location.reload();
      return
    }
    const next=normalizeSettingsData(await decodeTransferData(text.value),{requireMarker:true});
    const current=settingsDataForExport();
    if (describeSettingsDiff(current,next)==='沒有變更。') {
      pendingEditorImportData=null;
      setTransferStatus('匯入失敗：設定內容與目前設定相同。',true);
      return
    }
    pendingEditorImportData=next;
    showEditorImportModeConfirm(current,next)
  } catch (error) {
    pendingEditorImportData=null;
    text.value='';
    setTransferStatus('匯入失敗：內容無效或已損毀。',true)
  }
}
function mergeImportedSettings(current,imported,preserveStyle=false) {
  const merged=cloneSettingsData(current), addedActions=[], mergedActions=[], replacedActions=[];
  merged.teacherDB={...(current.teacherDB||{})};
  const teacherKeyMap={}, currentTeacherKeyMap={};
  Object.entries(imported.teacherDB||{}).forEach(([importedKey,importedInfo])=> {
    const matchedKey=current.teacherDB?.[importedKey]?importedKey:Object.keys(current.teacherDB||{}).find(currentKey=> {
      const currentInfo=current.teacherDB[currentKey]||[];
      return importedInfo[0]&&currentInfo[0]===importedInfo[0]||importedInfo[1]&&currentInfo[1]===importedInfo[1]
    });
    const targetKey=importedKey;
    teacherKeyMap[importedKey]=targetKey;
    if (matchedKey&&matchedKey!==importedKey) {
      currentTeacherKeyMap[matchedKey]=importedKey;
      delete merged.teacherDB[matchedKey]
    }
    merged.teacherDB[importedKey]=importedInfo;
    const targetLabel=importedInfo[0]||targetKey;
    (matchedKey?mergedActions:addedActions).push(matchedKey?`合併課程「${targetLabel}」（名稱相同，使用匯入的課程資料）`:`新增課程「${targetLabel}」`)
  });
  merged.locationDB={...(current.locationDB||{})};
  Object.entries(imported.locationDB||{}).forEach(([importedKey,value])=> {
    const targetKey=teacherKeyMap[importedKey]||importedKey;
    const targetLabel=merged.teacherDB[targetKey]?.[0]||targetKey;
    const oldKey=Object.keys(currentTeacherKeyMap).find(key=>currentTeacherKeyMap[key]===targetKey);
    if (oldKey&&oldKey!==targetKey) delete merged.locationDB[oldKey];
    const currentValue=current.locationDB?.[targetKey]||current.locationDB?.[oldKey]||'';
    if (currentValue!==value) replacedActions.push(`取代課程「${targetLabel}」地點：${currentValue||'（空白）'} -> ${value||'（空白）'}`);
    merged.locationDB[targetKey]=value
  });
  merged.weeklySchedule={};
  [0,1,2,3,4,5,6].forEach(day=> {
    const currentRow=current.weeklySchedule?.[day]||[], importedRow=imported.weeklySchedule?.[day]||[];
    const total=Math.max(currentRow.length,importedRow.length);
    merged.weeklySchedule[day]=Array.from({length:total},(_,index)=> {
      const currentKey=currentTeacherKeyMap[currentRow[index]]||currentRow[index]||'', importedKey=teacherKeyMap[importedRow[index]]||importedRow[index]||'';
      if (currentKey&&importedKey&&currentKey!==importedKey) replacedActions.push(`取代${dayDiffLabel(day)}第 ${index+1} 節：${formatClassRef(currentKey,current)} -> ${formatClassRef(importedKey,merged)}`);
      else if (!currentKey&&importedKey) addedActions.push(`新增${dayDiffLabel(day)}第 ${index+1} 節：${formatClassRef(importedKey,merged)}`);
      return importedKey||currentKey
    })
  });
  const importedTeacherOrder=imported.teacherOrder||Object.keys(imported.teacherDB||{});
  const currentTeacherOrder=current.teacherOrder||Object.keys(current.teacherDB||{});
  merged.teacherOrder=[...new Set(importedTeacherOrder.concat(currentTeacherOrder).map(key=>teacherKeyMap[key]||key).filter(key=>merged.teacherDB[key]))];
  if (Array.isArray(imported.bellTimes)&&imported.bellTimes.length) {
    merged.bellTimes=cloneSettingsData(imported.bellTimes);
    replacedActions.push('取代節次時間');
  }
  const breaks=new Map((current.breakTimes||[]).map(item=>[item.name,item]));
  const importedBreakNames=new Set();
  (imported.breakTimes||[]).forEach(item=> {
    const currentBreak=breaks.get(item.name);
    if (!currentBreak) addedActions.push(`新增特殊時段「${item.name}」`);
    else if (currentBreak.start===item.start&&currentBreak.end===item.end) mergedActions.push(`合併特殊時段「${item.name}」`);
    else replacedActions.push(`取代特殊時段「${item.name}」：${currentBreak.start}-${currentBreak.end} -> ${item.start}-${item.end}`);
    breaks.set(item.name,item);
    importedBreakNames.add(item.name)
  });
  // Drop only the specific breaks that no longer fit the merged bell schedule instead of aborting
  // the whole merge. Imported 特殊時段 (from AI recognition or a regular paste-import) take
  // priority: when two entries' times conflict, the one NOT from this import is dropped, so the
  // imported time always wins instead of silently disappearing.
  const keptBreaks=[];
  const orderedBreakEntries=[...breaks.values()].sort((a,b)=>(importedBreakNames.has(b.name)?1:0)-(importedBreakNames.has(a.name)?1:0));
  orderedBreakEntries.forEach(item=> {
    try {
      validateTimeIntervals(merged.bellTimes,[...keptBreaks,item]);
      keptBreaks.push(item)
    } catch (error) {
      replacedActions.push(`移除特殊時段「${item.name}」（與匯入的節次時間衝突）`)
    }
  });
  merged.breakTimes=keptBreaks;
  const events=new Map(getCountdownEvents(current).map(item=>[item.name,item]));
  getCountdownEvents(imported).forEach(item=> {
    const currentEvent=events.get(item.name);
    if (!currentEvent) addedActions.push(`新增倒數活動：${item.name}（${formatCountdownEventDate(item)}）`);
    else if (currentEvent.startDate===item.startDate&&currentEvent.endDate===item.endDate) mergedActions.push(`合併倒數活動：${item.name}（${formatCountdownEventDate(item)}）`);
    else replacedActions.push(`取代倒數活動：${item.name}（${formatCountdownEventDate(currentEvent)} -> ${formatCountdownEventDate(item)}）`);
    events.set(item.name,item)
  });
  merged.countdownEvents=[...events.values()];
  if (current.reverseWeek!==imported.reverseWeek) replacedActions.push(`取代單雙週設定：${imported.reverseWeek?'開啟':'關閉'}`);
  merged.reverseWeek=imported.reverseWeek;
  // Only a non-empty imported key replaces the current one — an older backup or an AI
  // import saved before a key existed shouldn't silently wipe the one already stored.
  if (imported.geminiApiKey && imported.geminiApiKey!==current.geminiApiKey) {
    merged.geminiApiKey=imported.geminiApiKey;
    replacedActions.push('更新 Gemini API 金鑰');
  }
  // AI imports keep this browser's visual preferences; regular backups retain
  // the imported palette and saved presets.
  if (preserveStyle) {
    merged.proAccent=current.proAccent;
    merged.proSecondary=current.proSecondary;
    merged.proTertiary=current.proTertiary;
    merged.styleSlots=normalizeStyleSlots(current.styleSlots).map(slot=>({...slot}));
  }
  return {data:normalizeSettingsData(merged),addedActions,mergedActions,replacedActions}
}
function showEditorImportModeConfirm(current,next,preserveStyle=false) {
  setEditorConfirmContent('匯入方式？','要合併目前設定與匯入設定嗎？','合併匯入會保留可共存內容；課表時間衝突時使用匯入內容。','合併匯入',()=>showEditorImportConfirm(current,next,true,preserveStyle),'直接匯入',{cancelHandler:()=>showEditorImportConfirm(current,next,false,preserveStyle),extraLabel:'取消',extraHandler:hideEditorDiscardConfirm});
  showEditorConfirmSheet()
}
function beginEditorImport(current,next,{preserveStyle=false}={}) {
  try {
    const normalizedCurrent=normalizeSettingsData(current);
    const normalizedNext=normalizeSettingsData(next);
    pendingEditorImportData=normalizedNext;
    showEditorImportModeConfirm(normalizedCurrent,normalizedNext,preserveStyle);
  } catch (error) {
    pendingEditorImportData=null;
    setTransferStatus(`匯入失敗：${error.message||error}`,true);
  }
}
function showEditorImportConfirm(current,next,isMerge,preserveStyle=false) {
  let result;
  try {
    if (isMerge) result=mergeImportedSettings(current,next,preserveStyle);
    else {
      const direct=cloneSettingsData(next);
      // AI imports are timetable-only and must not change this browser's visual
      // preferences; regular backups restore the saved visual preferences.
      direct.breakTimes=cloneSettingsData(next.breakTimes||[]);
      if (preserveStyle) {
        direct.proAccent=current.proAccent;
        direct.proSecondary=current.proSecondary;
        direct.proTertiary=current.proTertiary;
        direct.styleSlots=cloneSettingsData(current.styleSlots||[]);
      }
      result={data:normalizeSettingsData(direct),actions:[]};
    }
  } catch (error) {
    pendingEditorImportData=null;
    setEditorConfirmContent('匯入失敗','無法完成這次匯入，請調整後再試一次。',error.message||String(error),'返回',hideEditorDiscardConfirm,null);
    showEditorConfirmSheet();
    return;
  }
  pendingEditorImportData=result.data;
  const diff=isMerge?['新增：',...result.addedActions.map(item=>`- ${item}`),'','合併：',...result.mergedActions.map(item=>`- ${item}`),'','取代：',...result.replacedActions.map(item=>`- ${item}`)].join('\n'):describeSettingsDiff(current,next,{isImport:true});
  const identical=!isMerge&&diff==='沒有變更。';
  setEditorConfirmContent(isMerge?'確認合併匯入？':'確認直接匯入？',identical?'匯入內容與目前設定完全相同，仍可匯入。':isMerge?'以下分開列出新增、合併與取代的內容。':'匯入設定將取代目前已儲存的課表資料。',identical?'內容相同，沒有需要變更的項目。':diff,isMerge?'確認合併':'確認匯入',applyPendingImportSettings,'返回',{cancelHandler:()=>showEditorImportModeConfirm(current,next,preserveStyle)});
  showEditorConfirmSheet()
}
function applyEditorSettingsData(next,{closeAfter=false,statusMessage=''}={}) {
  applicationData=cloneSettingsData(next);
  if (Object.prototype.hasOwnProperty.call(applicationData,'geminiApiKey')) setStoredGeminiApiKey(applicationData.geminiApiKey);
  applicationData.proAccent=normalizeProAccent(applicationData.proAccent);
  applicationData.proSecondary=normalizeProSecondary(applicationData.proSecondary);
  applicationData.proTertiary=normalizeProTertiary(applicationData.proTertiary);
  applicationData.styleSlots=normalizeStyleSlots(applicationData.styleSlots);
  saveData(applicationData);
  applyProAccent();
  buildSchedule();
  renderEditorTeachers();
  renderEditorBells();
  renderEditorBreaks();
  renderEditorSchedule();
  renderCountdownEvent();
  sortEditorPeriodsByTime();
  syncEditorToggles();
  editorBaselineSnapshot=editorFormSnapshotString();
  editorBaselineData=cloneSettingsData(applicationData);
  lastListKey='';
  update();
  if (statusMessage) setTransferStatus(statusMessage);
  const toast = document.getElementById('save-toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
  if (closeAfter) setTimeout(() => closeEditor(true), 400)
}
function applyPendingImportSettings() {
  if (!pendingEditorImportData) {
    hideEditorDiscardConfirm();
    return
  }
  applyEditorSettingsData(pendingEditorImportData,{
    closeAfter:true,
    statusMessage:'已匯入並儲存，編輯器已更新為貼上的設定。'
  });
  document.getElementById('settings-transfer-text').value='';
  pendingEditorImportData=null;
  resetOCRImporterUI();
  hideEditorDiscardConfirm();
}
// Clears the AI photo-import box back to its empty state after a successful import/merge.
function resetOCRImporterUI() {
  const input=document.getElementById('ocr-import-image');
  if (input) input.value='';
  const wrap=document.getElementById('ocr-import-image-wrap');
  wrap?.classList.remove('has-image');
  const img=document.getElementById('ocr-import-image-preview');
  if (img) { img.hidden=true; img.removeAttribute('src') }
  const filename=document.getElementById('ocr-import-filename');
  if (filename) filename.textContent='尚未選擇檔案';
  const status=document.getElementById('ocr-import-status');
  if (status) { status.textContent=''; status.classList.remove('error') }
  const runBtn=document.getElementById('ocr-import-detect');
  if (runBtn) runBtn.disabled=true;
  const result=document.getElementById('ocr-import-result');
  if (result) { result.hidden=true; result.replaceChildren() }
}
function applyPendingSaveEditor() {
  if (!pendingEditorSaveData) {
    hideEditorDiscardConfirm();
    return
  }
  const transferAction=pendingTransferAction;
  pendingTransferAction=null;
  applyEditorSettingsData(pendingEditorSaveData,{closeAfter:!transferAction});
  pendingEditorSaveData=null;
  hideEditorDiscardConfirm();
  if (transferAction) runTransferAction(transferAction)
}

// ---- js/editor-core.js ----
// Builds a short display label for a class from its subject/teacher text.
// Teacher is appended in parentheses whenever the subject alone would be
// ambiguous (shared by another class) or when the subject is blank.
function formatClassLabel(subject,teacher,needsTeacher) {
  const cleanSubject=(subject||'').trim();
  const cleanTeacher=(teacher||'').trim();
  if (!cleanSubject) return cleanTeacher||'未命名';
  if (needsTeacher&&cleanTeacher) return `${cleanSubject}（${cleanTeacher}）`;
  return cleanSubject
}
// Collects available classes (key + display label) from the editor form's
// live subject/teacher inputs, so labels stay accurate mid-edit.
function getEditorTeacherEntriesFromDom()  {
  const cards=[...document.querySelectorAll('#teacher-list .teacher-card')];
  const rows=cards.map(card=>({
    key:(card.dataset.origKey||'').trim(),
    subject:(card.querySelector('.tc-subject')?.value||'').trim(),
    teacher:(card.querySelector('.tc-teacher')?.value||'').trim()
  })).filter(row=>row.key);
  const subjectCounts={};
  rows.forEach(row=>{subjectCounts[row.subject]=(subjectCounts[row.subject]||0)+1});
  const seen=new Set();
  const entries=[];
  rows.forEach(row=>{
    if (seen.has(row.key)) return;
    seen.add(row.key);
    entries.push({key:row.key,label:formatClassLabel(row.subject,row.teacher,subjectCounts[row.subject]>1)})
  });
  return entries
}
// Looks up a single class's display label by key from the editor form's live inputs.
function getEditorClassLabelFromDom(key) {
  const entry=getEditorTeacherEntriesFromDom().find(item=>item.key===key);
  return entry?entry.label:''
}
// Returns how many bell periods the editor should render.
function getEditorBellPeriodCount()  {
  const n=document.querySelectorAll('#bell-list .bell-row').length;
  return n>0?n:(applicationData.bellTimes||[
  ]).length
}
// Converts an HH:MM value into minutes for editor sorting.
function editorTimeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value||''))return 9999;
  const [hours,minutes]=value.split(':').map(Number);
  return hours*60+minutes
}
// Sorts bell rows by start time and moves the matching schedule dropdowns with them.
function sortEditorPeriodsByTime() {
  const bellList=document.getElementById('bell-list');
  const rows=Array.from(bellList.querySelectorAll('.bell-row'));
  if (rows.length<2)return;

  const ordered=rows.map((row,index)=> ({
    row,
    index,
    start:editorTimeToMinutes(row.querySelector('.bell-start')?.value),
    end:editorTimeToMinutes(row.querySelector('.bell-end')?.value)
  })).sort((a,b)=>a.start-b.start||a.end-b.end||a.index-b.index);

  if (ordered.every((item,newIndex)=>item.index===newIndex))return;

  ordered.forEach(item=>bellList.appendChild(item.row));

  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow=> {
    const periods=dayRow.querySelector('.schedule-periods');
    const selects=Array.from(periods.querySelectorAll('.period-select'));
    ordered.forEach((item,newIndex)=> {
      const select=selects[item.index];
      if (select) {
        select.dataset.period=String(newIndex);
        periods.appendChild(select)
      }
    })
  });

  refreshBellNumbers()
}
// Refreshes every class-period dropdown after teacher keys or names change.
function refreshPeriodSelectOptions()  {
  const entries=getEditorTeacherEntriesFromDom();
  document.querySelectorAll('#schedule-grid .period-select').forEach(sel=>  {
    const cur=sel.value;
    const list=entries.some(item=>item.key===cur)||!cur?entries:entries.concat({key:cur,label:cur});
    const opts=`<option value="">-</option>`+list.map(item=>`<option value="${esc(item.key)}" title="${esc(item.label)}">${esc(item.label)}</option>`).join('');
    sel.innerHTML=opts;
    sel.value=cur})
}
// Escapes text before inserting it into generated HTML.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Opens the schedule editor and prepares its editable fields.
// Editor navigation and confirmation sheets manage unsaved changes safely.
function openEditor() {
  closeAssignSheet();
  hideEditorDiscardConfirm();
  closeTestPanel();
  document.querySelector('.top-actions')?.classList.remove('open');
  const sheet=document.getElementById('editor-sheet');

  document.body.classList.add('editor-open');
  sheet.classList.add('show');

  try {
    renderEditorTeachers();
    renderEditorBells();
    renderEditorBreaks();
    renderEditorSchedule();
    renderCountdownEvent();
    sortEditorPeriodsByTime();
    syncEditorToggles();
    orderEditorFolds();
    moveEditorControlsIntoLayers();
    ensureEditorBackButtons();
    openEditorFold('editor-fold-schedule');
    editorBaselineSnapshot = editorFormSnapshotString();
    editorBaselineData = settingsDataForExport();
    setTransferStatus('');
  } catch (error) {
    console.error(error)
  }
}

function orderEditorFolds() {
  const inner=document.querySelector('#editor-sheet .editor-inner');
  const saveBtn=inner&&inner.querySelector('.save-btn');
  if (!inner||!saveBtn)return;
  [
    'editor-fold-schedule',
    'editor-fold-countdown',
    'editor-fold-teachers',
    'editor-fold-bells',
    'editor-fold-breaks',
    'editor-fold-transfer'
  ].forEach(id=> {
    const section=document.getElementById(id);
    if (section) inner.insertBefore(section,saveBtn)
  })
}
function renderCountdownEvent() {
  const list=document.getElementById('countdown-event-list');
  if (!list) return;
  list.innerHTML='';
  getCountdownEvents().forEach((event,index)=>addCountdownEventRow(event,index));
  refreshCountdownMoveButtons()
}
function addCountdownEventRow(event={name:'',startDate:'',endDate:''},index) {
  const list=document.getElementById('countdown-event-list');
  if (!list||list.children.length>=12) return;
  const row=document.createElement('div');
  row.className='countdown-event-row';
  row.innerHTML='<div class="countdown-event-header"><span class="countdown-event-title">倒數活動</span><div class="countdown-event-actions"><span class="countdown-drag-handle" role="button" tabindex="0" title="拖曳排序" aria-label="拖曳排序">☰</span><label class="order-position-label">順序<input class="order-position" type="number" min="1" inputmode="numeric" aria-label="倒數活動順序"></label><button type="button" class="countdown-event-remove" aria-label="移除倒數">×</button></div></div><div class="countdown-event-fields"><label>活動名稱<input class="editor-input countdown-event-name" maxlength="80" placeholder="例如：116 學測"></label><label class="countdown-event-daterange-label">日期<div class="countdown-date-range"><input class="editor-input countdown-event-start" type="date" aria-label="開始日期"><span class="time-sep">→</span><input class="editor-input countdown-event-end" type="date" aria-label="結束日期"></div></label></div>';
  const nameInput=row.querySelector('.countdown-event-name');
  const titleLabel=row.querySelector('.countdown-event-title');
  nameInput.value=event.name;
  if (event.name) titleLabel.textContent=event.name;
  nameInput.addEventListener('input',()=> {
    titleLabel.textContent=nameInput.value.trim()||'倒數活動';
  });
  const startInput=row.querySelector('.countdown-event-start');
  const endInput=row.querySelector('.countdown-event-end');
  startInput.value=event.startDate||event.date||'';
  endInput.value=event.endDate||event.date||'';
  startInput.addEventListener('change',()=> {
    if (!endInput.value||endInput.value<startInput.value) endInput.value=startInput.value;
  });
  row.querySelector('.countdown-event-remove').addEventListener('click',()=> {
    if (list.children.length>1) row.remove();
    else row.querySelectorAll('input').forEach(input=>input.value='');
  });
  list.appendChild(row);
  row.querySelector('.order-position').value=String(list.children.length);
  const positionInput=row.querySelector('.order-position');
  positionInput.addEventListener('change',event=>moveEditorRowToPosition(row,event.target.value,'#countdown-event-list .countdown-event-row'));
  positionInput.addEventListener('keydown',event=>{
    if (event.key==='Enter') {
      event.preventDefault();
      moveEditorRowToPosition(row,event.target.value,'#countdown-event-list .countdown-event-row');
      positionInput.blur();
    }
  });
  bindCountdownDrag(row);
  refreshCountdownMoveButtons()
}
function refreshCountdownMoveButtons() {
  const rows=[...document.querySelectorAll('#countdown-event-list .countdown-event-row')];
  rows.forEach((row,index)=>{
    row.querySelector('.countdown-drag-handle')?.setAttribute('aria-label','拖曳倒數活動排序');
    const input=row.querySelector('.order-position');
    if (input) { input.max=String(rows.length); input.value=String(index+1); }
  });
}
function getEditorScrollContainer(handle) {
  const sheet=handle.closest('.editor-sheet');
  if (!sheet) return null;
  const activeFold=sheet.querySelector('details.editor-fold.active .editor-fold-body');
  const inner=sheet.querySelector('.editor-inner');
  const candidates=[activeFold, inner, sheet].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.scrollHeight > candidate.clientHeight) return candidate;
  }
  return sheet;
}
function autoScrollEditorWhileDragging(handle,clientY) {
  const scroller=getEditorScrollContainer(handle);
  if (!scroller) return;
  const bounds=scroller.getBoundingClientRect();
  const edge=72;
  const maxScroll=Math.max(0, scroller.scrollHeight-scroller.clientHeight);
  if (clientY<bounds.top+edge) {
    scroller.scrollTop=Math.max(0, scroller.scrollTop-Math.ceil((bounds.top+edge-clientY)/4));
  } else if (clientY>bounds.bottom - edge) {
    scroller.scrollTop=Math.min(maxScroll, scroller.scrollTop+Math.ceil((clientY-(bounds.bottom - edge))/4));
  }
}
// Shared vertical drag-to-reorder for editor list rows (teacher cards, countdown
// events): drags `row` by the handle matching `handleSelector`, reordering it among
// its siblings matching `siblingsSelector`, auto-scrolling the editor sheet near its
// edges, and calling `onMove` (if given) after every reorder and once dragging ends.
function bindEditorDragReorder(row,handleSelector,siblingsSelector,onMove) {
  const handle=row.querySelector(handleSelector);
  if (!handle || handle.dataset.bound) return;
  handle.dataset.bound='1';
  handle.style.touchAction='none';
  let dragging=false;
  let lastY=0;
  let scrollFrame=0;
  const move=event=>{
    if (!dragging) return;
    lastY=event.clientY;
    autoScrollEditorWhileDragging(handle,event.clientY);
    const siblings=[...document.querySelectorAll(siblingsSelector)].filter(item=>item!==row);
    const target=siblings.find(item=>event.clientY<item.getBoundingClientRect().top+item.offsetHeight/2);
    if (target) target.parentElement.insertBefore(row,target);
    else if (siblings.length) siblings[siblings.length-1].parentElement.appendChild(row);
    onMove?.()
  };
  const autoScroll=()=>{
    if (!dragging) return;
    const scroller=getEditorScrollContainer(handle);
    const before=scroller?.scrollTop||0;
    autoScrollEditorWhileDragging(handle,lastY);
    if (scroller && scroller.scrollTop!==before) move({clientY:lastY});
    scrollFrame=requestAnimationFrame(autoScroll);
  };
  const finish=event=>{
    if (!dragging) return;
    dragging=false;
    row.classList.remove('is-dragging');
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',finish);
    window.removeEventListener('pointercancel',finish);
    window.removeEventListener('blur',finish);
    cancelAnimationFrame(scrollFrame);
    if (event?.pointerId!==undefined && handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    onMove?.()
  };
  handle.addEventListener('pointerdown',event=>{
    if (event.button!==undefined&&event.button!==0) return;
    event.preventDefault();
    dragging=true;
    lastY=event.clientY;
    row.classList.add('is-dragging');
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',finish);
    window.addEventListener('blur',finish);
    scrollFrame=requestAnimationFrame(autoScroll);
  });
  handle.addEventListener('pointerup',finish);
  handle.addEventListener('pointercancel',finish);
}
function bindCountdownDrag(row) {
  bindEditorDragReorder(row,'.countdown-drag-handle','#countdown-event-list .countdown-event-row');
}
function moveEditorControlsIntoLayers() {
  const inner=document.querySelector('#editor-sheet .editor-inner');
  const scheduleBody=document.querySelector('#editor-fold-schedule .editor-fold-body');
  const transfer=document.getElementById('editor-fold-transfer');
  const options=document.getElementById('editor-fold-options');
  const toggleRow=options&&options.querySelector('.toggle-row');
  const drillActions=scheduleBody&&scheduleBody.querySelector('.editor-drill-actions');
  if (inner) inner.classList.add('is-layered');
  if (transfer) {
    transfer.classList.add('editor-save-tools');
    transfer.open=false
  }
  if (toggleRow&&scheduleBody&&!scheduleBody.querySelector('.editor-inline-options')) {
    const wrap=document.createElement('div');
    wrap.className='editor-inline-options';
    wrap.appendChild(toggleRow);
    if (drillActions) scheduleBody.insertBefore(wrap,drillActions);
    else scheduleBody.prepend(wrap)
  }
  if (options) options.style.display='none'
}
function ensureEditorBackButtons() {
  document.querySelectorAll('#editor-sheet details.editor-fold').forEach(section=> {
    if (section.id==='editor-fold-schedule'||section.id==='editor-fold-transfer'||section.id==='editor-fold-options')return;
    if (section.closest('#ocr-import-result'))return;
    const body=section.querySelector('.editor-fold-body');
    if (!body||body.querySelector('.editor-back-row'))return;
    const row=document.createElement('div');
    row.className='editor-back-row';
    row.innerHTML='<button type="button" class="editor-back-btn" onclick="openEditorFold(\'editor-fold-schedule\')">返回課表</button>';
    body.prepend(row)
  })
}
function clearTransferField() {
  const text=document.getElementById('settings-transfer-text');
  if (text) {
    text.value='';
    text.blur()
  }
  setTransferStatus('')
}
function openEditorFold(id,force=false) {
  document.querySelectorAll('#editor-sheet details.editor-fold').forEach(section=> {
    // The transfer/OCR-import section is an always-visible tools panel, not a layer —
    // it manages its own open/closed state (see initEditorAccordion) and must never be
    // force-closed just because a different page layer became active, or an expanded
    // import button the user is mid-way through using would vanish under them.
    if (section.id==='editor-fold-transfer') return;
    const active=section.id===id;
    section.open=active;
    section.classList.toggle('active',active)
  });
  // Do not force-scroll the editor when switching layers.
}

function setEditorConfirmContent(title,message,diffText,confirmLabel,confirmHandler,cancelLabel='取消',options={}) {
  const sheet=document.getElementById('editor-confirm-sheet');
  const titleEl=document.getElementById('editor-confirm-title');
  const msgEl=document.getElementById('editor-confirm-msg');
  const overlay=document.getElementById('editor-confirm-overlay');
  const buttons=sheet.querySelectorAll('.editor-confirm-btn');
  const cancelBtn=buttons[0];
  const confirmBtn=buttons[1];
  let extraBtn=document.getElementById('editor-confirm-extra-btn');
  if (!extraBtn) {
    extraBtn=document.createElement('button');
    extraBtn.id='editor-confirm-extra-btn';
    extraBtn.type='button';
    extraBtn.className='editor-confirm-btn';
    sheet.querySelector('.editor-confirm-actions').appendChild(extraBtn)
  }
  const canCancel=cancelLabel!==null&&!options.required;
  let diffEl=document.getElementById('editor-import-diff');
  if (!diffEl) {
    diffEl=document.createElement('div');
    diffEl.id='editor-import-diff';
    diffEl.className='editor-import-diff';
    msgEl.insertAdjacentElement('afterend',diffEl)
  }
  titleEl.textContent=title;
  msgEl.textContent=message;
  diffEl.textContent=diffText||'';
  diffEl.scrollTop=0;
  diffEl.style.display=diffText?'block':'none';
  cancelBtn.style.display=canCancel?'':'none';
  cancelBtn.textContent=canCancel?cancelLabel:'';
  cancelBtn.onclick=canCancel?(options.cancelHandler||hideEditorDiscardConfirm):null;
  extraBtn.style.display=options.extraLabel?'':'none';
  extraBtn.textContent=options.extraLabel||'';
  extraBtn.onclick=options.extraLabel?(options.extraHandler||hideEditorDiscardConfirm):null;
  overlay.onclick=canCancel?hideEditorDiscardConfirm:function(event) { event.stopPropagation() };
  confirmBtn.textContent=confirmLabel;
  confirmBtn.onclick=confirmHandler;
}
function showEditorConfirmSheet() {
  document.getElementById('editor-confirm-overlay').classList.add('show');
  document.getElementById('editor-confirm-sheet').classList.add('show');
  document.getElementById('editor-confirm-overlay').setAttribute('aria-hidden','false')
}
function getEditorUnsavedDiff() {
  try {
    sortEditorPeriodsByTime();
    return describeSettingsDiff(editorBaselineData||normalizeSettingsData(applicationData),settingsDataForExport())
  } catch (error) {
    return ''
  }
}
async function showEditorDiscardConfirm() {
  // Pasted-text or AI/OCR import data that was never actually applied isn't reflected
  // in the settings diff below — it needs its own explanation so the user understands
  // what they're about to lose.
  if (!isEditorDirty()&&await hasUnconsumedImportData()) {
    setEditorConfirmContent(
      '尚未匯入內容？',
      getUnconsumedImportWarningText(),
      '',
      '捨棄離開',
      discardEditorChangesAndClose,
      '返回'
    );
    showEditorConfirmSheet();
    return
  }
  setEditorConfirmContent(
    '捨棄變更？',
    '以下尚未儲存的變更將不會套用。',
    getEditorUnsavedDiff(),
    '捨棄',
    discardEditorChangesAndClose,
    '返回'
  );
  showEditorConfirmSheet()
}
function showEditorSaveConfirm(diffText) {
  setEditorConfirmContent(
    '要儲存嗎？',
    '會套用以下變更。',
    diffText,
    '儲存',
    applyPendingSaveEditor,
    '返回'
  );
  showEditorConfirmSheet()
}
// Hides the discard confirmation sheet.
function hideEditorDiscardConfirm() {
  pendingAfterEditorDiscard=null;
  pendingEditorImportData=null;
  pendingEditorSaveData=null;
  pendingBellDelete=null;
  pendingTeacherDelete=null;
  pendingStyleSaveData=null;
  pendingStyleSlotIndex=null;
  pendingStyleSlotSaveIndex=null;
  const diffEl=document.getElementById('editor-import-diff');
  if (diffEl) diffEl.scrollTop=0;
  document.getElementById('editor-confirm-overlay').classList.remove('show');
  document.getElementById('editor-confirm-sheet').classList.remove('show');
  document.getElementById('editor-confirm-overlay').setAttribute('aria-hidden', 'true')
}

// Discards editor changes and closes the editor.
function discardEditorChangesAndClose() {
  const pending=pendingAfterEditorDiscard;
  pendingAfterEditorDiscard=null;
  hideEditorDiscardConfirm();
  closeEditor(true);
  if (pending==='test') {
    openTestPanel()
  } else if (pending==='style') {
    openStylePanel()
  }
}

function getUnconsumedImportWarningText() {
  const text = document.getElementById('settings-transfer-text');
  const hasPastedText = !!(text && text.value.trim());
  const result = document.getElementById('ocr-import-result');
  const hasAiPreview = !!(result && !result.hidden && result.childElementCount > 0);

  if (hasPastedText && hasAiPreview) return '未匯入的貼上內容與 AI 辨識結果將被清除。';
  if (hasPastedText) return '未匯入的貼上內容將被清除。';
  if (hasAiPreview) return '未匯入的 AI 辨識結果將被清除。';
  return '未匯入內容將被清除。'
}

async function hasDuplicateTransferData() {
  const text = document.getElementById('settings-transfer-text');
  if (!text || !text.value.trim()) return false;
  try {
    const next = normalizeSettingsData(await decodeTransferData(text.value), { requireMarker: true });
    const current = settingsDataForExport();
    return describeSettingsDiff(current, next) === '沒有變更。'
  } catch (error) {
    return false
  }
}

// True when there is pasted-JSON or AI-photo-recognized import data sitting around that was
// never actually applied — used so we can warn the user before it gets wiped on exit.
async function hasUnconsumedImportData() {
  const text = document.getElementById('settings-transfer-text');
  const hasPastedText = !!(text && text.value.trim());
  const result = document.getElementById('ocr-import-result');
  const hasAiPreview = !!(result && !result.hidden && result.childElementCount > 0);
  if (hasPastedText && await hasDuplicateTransferData()) return false;
  return hasPastedText || hasAiPreview || !!pendingEditorImportData;
}

// Reminds the user that unapplied import data (pasted text or AI photo result) is being discarded.
function notifyDiscardedImportData() {
  const toast = document.getElementById('save-toast');
  if (!toast) return;
  const previousText = toast.textContent;
  toast.textContent = '已清除未匯入內容。';
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.textContent = previousText }, 300)
  }, 2500)
}

// Closes the editor, asking for confirmation when there are unsaved changes.
async function closeEditor(force) {
  const sheet = document.getElementById('editor-sheet');

  if (typeof isOcrProcessing !== 'undefined' && isOcrProcessing) {
    setEditorConfirmContent(
      'AI 辨識中',
      'Gemini 正在辨識課表圖片，請稍候辨識完成後再關閉，否則辨識結果將會遺失。',
      '',
      '知道了',
      hideEditorDiscardConfirm,
      null
    );
    showEditorConfirmSheet();
    return
  }

  if (!sheet.classList.contains('show')) {
    hideEditorDiscardConfirm();
    document.body.classList.remove('editor-open');
    return
  }

  if (!force && (isEditorDirty()||await hasUnconsumedImportData())) {
    showEditorDiscardConfirm();
    return
  }

  hideEditorDiscardConfirm();
  const hadUnconsumedImportData = await hasUnconsumedImportData();
  sheet.classList.remove('show');
  document.body.classList.remove('editor-open');
  // Wipe any AI import data (pasted JSON and AI-recognized photo result) so it never lingers
  // into the next time the editor is opened.
  clearTransferField();
  resetOCRImporterUI();
  pendingEditorImportData = null;
  closeTestPanel();
  if (hadUnconsumedImportData) notifyDiscardedImportData()
}

// Updates editor toggle controls from the saved app data.
function syncEditorToggles() {
  const btn = document.getElementById('toggle-reverse');
  btn.classList.toggle('on', !!applicationData.reverseWeek)
}

// Toggles whether odd/even week logic is reversed.
function toggleReverse() {
  const btn = document.getElementById('toggle-reverse');
  btn.classList.toggle('on')
}


// ---- js/editor-teachers.js ----
// Renders the editable teacher list.
function renderEditorTeachers() {
  const container = document.getElementById('teacher-list');
  container.innerHTML = '';

  (applicationData.teacherOrder||Object.keys(applicationData.teacherDB)).filter(key=>applicationData.teacherDB[key]).forEach(key => {
    const val=applicationData.teacherDB[key];
    const loc = applicationData.locationDB[key] || '';
    container.appendChild(makeTeacherCard(key, val[0], val[1], loc))
  });
  refreshTeacherMoveButtons()
}

// Generates a stable internal id for a class. Never shown or edited by the
// user - it only ever lives in dataset.origKey and the saved data's map keys.
function generateTeacherKey() {
  const existing=new Set([...document.querySelectorAll('#teacher-list .teacher-card')].map(card=>card.dataset.origKey));
  let key;
  do { key='c'+Math.random().toString(36).slice(2,8) } while (existing.has(key));
  return key
}

// Creates one editable teacher row.
function makeTeacherCard(key, subject, teacher, location) {
  const div = document.createElement('div');
  div.className = 'teacher-card';
  div.dataset.origKey = key;
  div.innerHTML = `<div class="teacher-avatar"></div><div class="teacher-fields"><input class="editor-input tc-subject" placeholder="科目" value="${esc(subject)}"><input class="editor-input tc-teacher" placeholder="教師" value="${esc(teacher)}"><input class="editor-input tc-location" placeholder="教室(選填)" value="${esc(location || '')}"></div><div class="teacher-order-actions"><span class="teacher-drag-handle" role="button" tabindex="0" title="拖曳排序" aria-label="拖曳排序">☰</span><label class="order-position-label">順序<input class="order-position" type="number" min="1" inputmode="numeric" aria-label="科目教師順序"></label><button type="button" class="teacher-assign" onclick="assignTeacherFromMenu(this)" aria-label="指定課節">排課</button><button type="button" class="delete-btn" onclick="deleteTeacherCard(this)" aria-label="刪除">×</button></div>`;
  updateTeacherCardAvatar(div);
  const positionInput=div.querySelector('.order-position');
  positionInput.addEventListener('change',event=>moveEditorRowToPosition(div,event.target.value,'#teacher-list .teacher-card'));
  positionInput.addEventListener('keydown',event=>{
    if (event.key==='Enter') {
      event.preventDefault();
      moveEditorRowToPosition(div,event.target.value,'#teacher-list .teacher-card');
      positionInput.blur();
    }
  });
  bindEditorDragReorder(div,'.teacher-drag-handle','#teacher-list .teacher-card',()=>{
    refreshTeacherMoveButtons();
    refreshPeriodSelectOptions();
  });

  div.querySelector('.tc-subject').addEventListener('input', function() {
    updateTeacherCardAvatar(div);
    refreshPeriodSelectOptions()
  });
  div.querySelector('.tc-teacher').addEventListener('input', refreshPeriodSelectOptions);

  return div
}

// Deterministic background color for a subject's avatar, so the same subject
// always gets the same color across renders.
const TEACHER_AVATAR_HUES=[6,28,48,145,168,200,225,265,290,330];
function subjectAvatarHue(subject) {
  const text=String(subject||'').trim();
  if (!text) return TEACHER_AVATAR_HUES[0];
  let hash=0;
  for (let i=0;i<text.length;i++) hash=(hash*31+text.charCodeAt(i))>>>0;
  return TEACHER_AVATAR_HUES[hash%TEACHER_AVATAR_HUES.length]
}
// Updates a teacher card's colored initial avatar from its current subject text.
function updateTeacherCardAvatar(card) {
  const avatar=card.querySelector('.teacher-avatar');
  if (!avatar) return;
  const subject=(card.querySelector('.tc-subject')?.value||'').trim();
  const initial=subject?[...subject][0]:'?';
  const hue=subjectAvatarHue(subject);
  avatar.textContent=initial;
  avatar.style.setProperty('--avatar-hue',String(hue));
}
let pendingAssignment=null;
let assignmentDraft=null;
let assignmentDay=1;
function closeAssignSheet() {
  document.getElementById('assign-overlay')?.classList.remove('show');
  document.getElementById('assign-sheet')?.classList.remove('show');
  document.getElementById('assign-overlay')?.setAttribute('aria-hidden','true');
  pendingAssignment=null;
  assignmentDraft=null;
}
function openAssignSheet(key) {
  const grid=document.getElementById('assign-grid'), subtitle=document.getElementById('assign-subtitle'), tabs=document.getElementById('assign-day-tabs');
  if (!grid) return;
  subtitle.textContent=`選擇「${getEditorClassLabelFromDom(key)||key}」要放置的星期與節次`;
  grid.replaceChildren();
  assignmentDraft={key,original:new Map(),draft:new Map()};
  const labels={1:'週一',2:'週二',3:'週三',4:'週四',5:'週五',6:'週六',0:'週日'};
  const count=getEditorBellPeriodCount();
  [1,2,3,4,5,6,0].forEach(day=>{
    for(let period=0;period<count;period++){
      const select=document.querySelector(`#schedule-grid .schedule-day-row[data-day="${day}"]`)?.querySelectorAll('.period-select')[period];
      const slot=`${day}:${period}`, original=select?.value||'';
      assignmentDraft.original.set(slot,original); assignmentDraft.draft.set(slot,original);
    }
  });
  tabs.replaceChildren();
  [1,2,3,4,5,6,0].forEach(day=>{
    const tab=document.createElement('button');
    tab.type='button'; tab.className='assign-day-tab'; tab.dataset.day=day; tab.setAttribute('role','tab');
    tab.textContent=labels[day]; tab.onclick=()=>renderAssignmentDay(day);
    tabs.appendChild(tab);
  });
  assignmentDay=1;
  renderAssignmentDay(assignmentDay);
  document.getElementById('assign-overlay').classList.add('show');
  document.getElementById('assign-sheet').classList.add('show');
  document.getElementById('assign-overlay').setAttribute('aria-hidden','false');
}
function renderAssignmentDay(day) {
  const grid=document.getElementById('assign-grid');
  if (!grid||!assignmentDraft) return;
  assignmentDay=day;
  document.querySelectorAll('#assign-day-tabs .assign-day-tab').forEach(tab=>{
    const active=Number(tab.dataset.day)===day;
    tab.classList.toggle('active',active); tab.setAttribute('aria-selected',active?'true':'false');
  });
  grid.replaceChildren();
  const count=getEditorBellPeriodCount();
    const row=document.createElement('div'); row.className='assign-day-row';
    const label=document.createElement('div'); label.className='assign-day-label'; label.textContent=({1:'週一',2:'週二',3:'週三',4:'週四',5:'週五',6:'週六',0:'週日'})[day]; row.appendChild(label);
    const periods=document.createElement('div'); periods.className='assign-periods';
    for(let period=0;period<count;period++){
      const slot=`${day}:${period}`, original=assignmentDraft.original.get(slot)||'', value=assignmentDraft.draft.get(slot)||'';
      const valueLabel=value?(getEditorClassLabelFromDom(value)||value):'';
      const box=document.createElement('button'); box.type='button'; box.dataset.slot=slot;
      box.className='assign-box'+(value?' occupied':'')+(value===assignmentDraft.key?' assigned':'');
      box.textContent=`${period+1} · ${valueLabel||'—'}`; box.title=value?`第 ${period+1} 節目前是：${valueLabel}`:`第 ${period+1} 節（空白）`;
      box.onclick=()=>assignToSlot(assignmentDraft.key,day,period);
      periods.appendChild(box);
    }
    row.appendChild(periods); grid.appendChild(row);
}
function assignToSlot(key,day,period) {
  if (!assignmentDraft) return;
  const slot=`${day}:${period}`, box=document.querySelector(`#assign-grid .assign-box[data-slot="${slot}"]`);
  const current=assignmentDraft.draft.get(slot)||'', original=assignmentDraft.original.get(slot)||'';
  if (current===key) assignmentDraft.draft.set(slot,original===key?'':original);
  else {
    if (current && current!==key) {
      pendingAssignment={key,day,period};
      setEditorConfirmContent('覆蓋這個時段？',`第 ${period+1} 節目前是「${getEditorClassLabelFromDom(current)||current}」，確定改成「${getEditorClassLabelFromDom(key)||key}」嗎？`,'','確定覆蓋',confirmAssignment,'返回');
      showEditorConfirmSheet();
      return;
    }
    assignmentDraft.draft.set(slot,key);
  }
  if (box) {
    const value=assignmentDraft.draft.get(slot)||'';
    box.textContent=`${period+1} · ${value?(getEditorClassLabelFromDom(value)||value):'—'}`;
    box.classList.toggle('assigned',value===key);
    box.classList.toggle('occupied',!!value);
  }
}
function confirmAssignment() {
  const pending=pendingAssignment;
  pendingAssignment=null; hideEditorDiscardConfirm();
  if (pending && assignmentDraft) {
    assignmentDraft.draft.set(`${pending.day}:${pending.period}`,pending.key);
    renderAssignmentDay(pending.day);
  }
}
function applyAssignments() {
  if (!assignmentDraft) return;
  assignmentDraft.draft.forEach((value,slot)=>{
    const [day,period]=slot.split(':').map(Number);
    const select=document.querySelector(`#schedule-grid .schedule-day-row[data-day="${day}"]`)?.querySelectorAll('.period-select')[period];
    if (select && select.value!==value) { select.value=value; select.dispatchEvent(new Event('change',{bubbles:true})); }
  });
  closeAssignSheet();
}
function assignTeacherFromMenu(button) {
  const card=button.closest('.teacher-card');
  const key=(card?.dataset.origKey||'').trim();
  if (!key) return;
  openAssignSheet(key);
}
function moveEditorRowToPosition(row,value,selector) {
  const rows=[...document.querySelectorAll(selector)].filter(item=>item!==row);
  if (!rows.length) return;
  const position=Math.max(1,Math.min(rows.length+1,Number.parseInt(value,10)||1));
  const target=rows[position-1];
  if (target) target.parentElement.insertBefore(row,target);
  else rows[rows.length-1].parentElement.appendChild(row);
  if (row.classList.contains('teacher-card')) {
    refreshTeacherMoveButtons();
    refreshPeriodSelectOptions();
  } else {
    refreshCountdownMoveButtons();
  }
}
function refreshTeacherMoveButtons() {
  const rows=Array.from(document.querySelectorAll('#teacher-list .teacher-card'));
  rows.forEach((row,index)=>{
    const input=row.querySelector('.order-position');
    if (input) { input.max=String(rows.length); input.value=String(index+1); }
  });
}

// Adds a blank teacher row to the editor.
function addTeacherRow() {
  document.getElementById('teacher-list').appendChild(makeTeacherCard(generateTeacherKey(), '', ''));
  refreshPeriodSelectOptions()
}

function getTeacherDeleteKey(card) {
  return (card?.dataset.origKey||'').trim()
}
function getTeacherDeleteImpacts(key) {
  const data=collectEditorFormState();
  const impacts=[];
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow=> {
    const day=parseInt(dayRow.dataset.day,10);
    dayRow.querySelectorAll('.period-select').forEach((select,index)=> {
      if (select.value===key) impacts.push(`${dayDiffLabel(day)}第 ${index+1} 節：${formatClassRef(key,data)}`)
    })
  });
  return impacts
}
function applyTeacherCardDelete(btn) {
  const card=btn.closest('.teacher-card');
  const key=(card?.dataset.origKey||'').trim();
  card?.remove();
  document.querySelectorAll('#schedule-grid .period-select').forEach(select=>{
    if (select.value===key) select.value='';
  });
  refreshPeriodSelectOptions()
}
function confirmTeacherCardDelete() {
  if (!pendingTeacherDelete) {
    hideEditorDiscardConfirm();
    return
  }
  const btn=pendingTeacherDelete.btn;
  pendingTeacherDelete=null;
  hideEditorDiscardConfirm();
  applyTeacherCardDelete(btn)
}

// Removes a teacher row from the editor.
function deleteTeacherCard(btn) {
  const card=btn.closest('.teacher-card');
  const key=getTeacherDeleteKey(card);
  const label=key?(getEditorClassLabelFromDom(key)||key):'';
  const impacts=key?getTeacherDeleteImpacts(key):[];
  if (impacts.length) {
    pendingTeacherDelete={btn,key};
    setEditorConfirmContent(
      `刪除「${label}」？`,
      '這會移除這個課程，並清空所有使用它的課表格子。',
      impacts.join('\n'),
      '刪除',
      confirmTeacherCardDelete,
      '返回'
    );
    showEditorConfirmSheet();
    return
  }
  applyTeacherCardDelete(btn)
}


// ---- js/editor-schedule.js ----
// Renders the day-by-day period dropdowns in the editor.
// Renders day-by-day period selectors from the saved or currently edited schedule.
function renderEditorSchedule(weeklyScheduleOverride) {
  const container = document.getElementById('schedule-grid');
  const dayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const entries = getEditorTeacherEntriesFromDom();
  const periodCount = getEditorBellPeriodCount();
  const weeklySchedule = weeklyScheduleOverride || applicationData.weeklySchedule;

  container.innerHTML = '';

  [1, 2, 3, 4, 5, 6, 0].forEach(day => {
    const row = document.createElement('div');
    const daySchedule = weeklySchedule[day] || [];
    let periodHtml = '';

    row.className = 'schedule-day-row';
    row.dataset.day = String(day);

    for (let i = 0; i < periodCount; i++) {
      const value = daySchedule[i] || '';
      const options = entries
        .map(item => `<option value="${esc(item.key)}" title="${esc(item.label)}"${value === item.key ? ' selected' : ''}>${esc(item.label)}</option>`)
        .join('');

      periodHtml += `<select class="period-select" data-period="${i}"><option value="">-</option>${options}</select>`
    }

    row.innerHTML = `<div class="schedule-day-label">${dayLabels[day]}</div><div class="schedule-periods">${periodHtml}</div>`;
    container.appendChild(row)
  })
}

// Renders editable bell-time rows.
function renderEditorBells() {
  const container = document.getElementById('bell-list');
  container.innerHTML = '';

  applicationData.bellTimes.forEach((bellTime, index) => {
    container.appendChild(makeBellRow(index + 1,bellTime[0],bellTime[1]))
  });

  refreshBellNumbers()
}

// Creates one editable class-period time row.
function makeBellRow(number,startValue,endValue) {
  const row = document.createElement('div');
  row.className = 'bell-row';
  row.innerHTML = `<div class="bell-num">${number}</div><div class="bell-inputs"><input class="time-input bell-start" type="time" value="${esc(startValue)}"><span class="time-sep">→</span><input class="time-input bell-end" type="time" value="${esc(endValue)}"></div><button type="button" class="delete-btn" onclick="deleteBellRow(this)" aria-label="刪除節次">×</button>`;
  return row
}

// Renumbers bell rows after adding or deleting periods.
function refreshBellNumbers() {
  document.querySelectorAll('#bell-list .bell-row').forEach((row, index) => {
    row.querySelector('.bell-num').textContent = index + 1
  })
}

// Adds a new bell-time row using the previous row as a starting point.
function addBellRow() {
  const rows = document.querySelectorAll('#bell-list .bell-row');
  const last = rows[rows.length - 1];
  let startValue = '17:00';
  let endValue = '17:50';

  if (last&&last.querySelector('.bell-end')) {
    startValue = last.querySelector('.bell-end').value;
    const [hours, minutes] = startValue.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + 50;
    endValue = `${pad2(Math.floor(endMinutes / 60))}:${pad2(endMinutes % 60)}`
  }

  document.getElementById('bell-list').appendChild(makeBellRow(rows.length + 1,startValue,endValue));
  refreshBellNumbers();
  const draft=collectEditorFormState();
  renderEditorSchedule(draft.weeklySchedule);
  sortEditorPeriodsByTime()
}

function getBellDeleteImpacts(index) {
  const data=collectEditorFormState();
  const impacts=[];
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow=> {
    const day=parseInt(dayRow.dataset.day,10);
    const select=dayRow.querySelectorAll('.period-select')[index];
    if (select&&select.value) impacts.push(`${dayDiffLabel(day)}第 ${index+1} 節：${formatClassRef(select.value,data)}`)
  });
  return impacts
}
function applyBellRowDelete(btn) {
  const row=btn.closest('.bell-row');
  const index=Array.from(document.querySelectorAll('#bell-list .bell-row')).indexOf(row);
  if (index<0)return;
  row.remove();
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow=> {
    const select=dayRow.querySelectorAll('.period-select')[index];
    if (select)select.remove()
  });
  refreshBellNumbers();
  const draft=collectEditorFormState();
  renderEditorSchedule(draft.weeklySchedule);
  sortEditorPeriodsByTime()
}
function confirmBellRowDelete() {
  if (!pendingBellDelete) {
    hideEditorDiscardConfirm();
    return
  }
  const btn=pendingBellDelete.btn;
  pendingBellDelete=null;
  hideEditorDiscardConfirm();
  applyBellRowDelete(btn)
}

// Deletes a bell-time row and rebuilds dependent schedule controls.
function deleteBellRow(btn) {
  const row=btn.closest('.bell-row');
  const index=Array.from(document.querySelectorAll('#bell-list .bell-row')).indexOf(row);
  const impacts=getBellDeleteImpacts(index);
  if (impacts.length) {
    pendingBellDelete={btn,index};
    setEditorConfirmContent(
      `刪除第 ${index+1} 節？`,
      `這會移除第 ${index+1} 節的課程，後面的節次會往前移。`,
      impacts.join('\n'),
      '刪除',
      confirmBellRowDelete,
      '返回'
    );
    showEditorConfirmSheet();
    return
  }
  applyBellRowDelete(btn)
}

// Renders named break blocks such as cleaning time.
function renderEditorBreaks() {
  const container=document.getElementById('break-list');
  container.innerHTML='';

  (applicationData.breakTimes||[]).forEach(item=> {
    container.appendChild(makeBreakRow(item.name,item.start,item.end))
  });
  sortEditorBreaksByTime()
}

// Creates one editable named break row.
function makeBreakRow(name,start,end) {
  const row=document.createElement('div');
  row.className='bell-row break-row';
  row.innerHTML=`<div class="teacher-fields"><input class="editor-input break-name" placeholder="名稱" value="${esc(name||'')}"><div class="bell-inputs"><input class="time-input break-start" type="time" value="${esc(start||'08:50')}"><span class="time-sep">→</span><input class="time-input break-end" type="time" value="${esc(end||'09:10')}"></div></div><button class="delete-btn" onclick="deleteBreakRow(this)" aria-label="刪除特殊時段">×</button>`;
  return row
}

// Adds a blank named break row.
function addBreakRow() {
  document.getElementById('break-list').appendChild(makeBreakRow('','',''));
  sortEditorBreaksByTime()
}

function sortEditorBreaksByTime() {
  const list=document.getElementById('break-list');
  if (!list) return;
  Array.from(list.querySelectorAll('.break-row')).sort((a,b)=>editorTimeToMinutes(a.querySelector('.break-start')?.value)-editorTimeToMinutes(b.querySelector('.break-start')?.value)).forEach(row=>list.appendChild(row))
}

// Deletes a named break row.
function deleteBreakRow(btn) {
  btn.closest('.break-row').remove()
}

// Saves editor changes, rebuilds the schedule, and closes the editor.
function saveEditor() {
  sortEditorPeriodsByTime();
  sortEditorBreaksByTime();
  const draft=collectEditorFormState();
  try { validateTimeIntervals(draft.bellTimes,draft.breakTimes) } catch (error) {
    showEditorTimeConflict(error.message);
    return
  }
  const next = normalizeSettingsData(collectEditorFormState());
  const baseline = editorBaselineData||normalizeSettingsData(applicationData);
  const diff = describeSettingsDiff(baseline,next);
  pendingEditorSaveData = next;
  showEditorSaveConfirm(diff)
}

function showEditorTimeConflict(message) {
  setEditorConfirmContent(
    '時間有重疊',
    '目前設定無法儲存。請調整其中一個時間，讓課堂與特殊時段不要互相覆蓋。',
    message,
    '前往調整時間',
    ()=> {
      hideEditorDiscardConfirm();
      const isBreakConflict=/特殊時段/.test(message);
      openEditorFold(isBreakConflict?'editor-fold-breaks':'editor-fold-bells',true)
    },
    '返回編輯'
  );
  showEditorConfirmSheet()
}


// ---- js/dashboard-render.js ----
// Manual simulator controls change the displayed clock without changing saved data.
// Updates the simulation play/pause button and indicator.
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
      exitButton.style.opacity = '1'
    }
  } else if (window.IS_SIMULATING) {
    btn.textContent = '暫停';
    btn.classList.add('active');
    indicator.style.display = 'inline-flex';

    if (exitButton) {
      exitButton.disabled = false;
      exitButton.style.opacity = '1'
    }
  } else {
    btn.textContent = '繼續';
    btn.classList.remove('active');
    indicator.style.display = 'none';

    if (exitButton) {
      exitButton.disabled = false;
      exitButton.style.opacity = '1'
    }
  }
}

// Keeps only one editor accordion section open at a time.
(function initEditorAccordion() {
  const sheet = document.getElementById('editor-sheet');

  if (!sheet) return;

  sheet.querySelectorAll('details.editor-fold').forEach(det => {
    const summary=det.querySelector('.editor-fold-summary');

    if (summary) {
      summary.addEventListener('click', event => {
        if (!sheet.querySelector('.editor-inner')?.classList.contains('is-layered')) return;
        if (det.id==='editor-fold-transfer') return;

        // In layered mode, the active layer should stay open.
        // Prevent the native <details> close/reopen flash.
        if (det.classList.contains('active')) {
          event.preventDefault()
        }
      })
    }

    det.addEventListener('toggle', () => {
      if (sheet.querySelector('.editor-inner')?.classList.contains('is-layered')) {
        if (det.id==='editor-fold-transfer') return;
        if (det.open && !det.classList.contains('active')) openEditorFold(det.id);
        else if (!det.open && det.classList.contains('active')) det.open=true;
        return
      }
      if (!det.open) return;

      sheet.querySelectorAll('details.editor-fold').forEach(other => {
        if (other !== det) other.open = false
      })
    })
  })
})();
// The reserved auto-alignment space remains available during manual scrolling
// so late classes can still be brought to the intended viewport position.
(function initScheduleScrollClamp() {
  const list=document.getElementById('schedule-list');

  if (!list)return;

  list.addEventListener('scroll',()=>{
    clampManualListScroll();
  },{passive:true});
  // Mark real user input the instant it starts, not only once a 'scroll' event
  // eventually fires — see the comment on keepActiveClassVisible.
  ['pointerdown','touchstart','wheel'].forEach(type=>{
    list.addEventListener(type,()=>{ userScrolledDuringAlign=true },{passive:true})
  })
})();


/* Dashboard sizing and accessible list rendering. */
let titleFitState = { key:'', raf:0 };
function fitNowTitleText(force=false) {
  const title=document.getElementById('now-name');
  const stack=document.querySelector('.now-stack');
  const meta=document.querySelector('.now-meta-row');
  if (!title||!stack) return;

  const raw=(title.textContent||'').trim();
  const isStatus=stack.classList.contains('is-status');
  const hasLatin=/[A-Za-z]/.test(raw);
  const vw=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
  const defaultSize=vw<=430 ? (isStatus?48:48) : (isStatus?46:46);
  const minSize=hasLatin ? 18 : 22;
  const stackWidth=Math.round(stack.getBoundingClientRect().width);
  const metaText=meta?(meta.textContent||'').trim():'';
  const metaDisplay=meta?getComputedStyle(meta).display:'';
  const key=[raw,isStatus?'status':'class',stackWidth,metaText,metaDisplay,vw<=430?'m':'w'].join('|');
  if (!force && titleFitState.key===key) return;
  titleFitState.key=key;
  if (titleFitState.raf) cancelAnimationFrame(titleFitState.raf);

  titleFitState.raf=requestAnimationFrame(()=>{
    const styles=getComputedStyle(stack);
    const paddingX=(parseFloat(styles.paddingLeft)||0)+(parseFloat(styles.paddingRight)||0);
    const gap=parseFloat(styles.columnGap||styles.gap)||0;
    const metaVisible=meta && getComputedStyle(meta).display!=='none';
    const metaWidth=metaVisible?Math.ceil(meta.getBoundingClientRect().width):0;
    const available=Math.max(72,Math.floor(stack.clientWidth-paddingX-(metaWidth?metaWidth+gap:0)));

    title.style.whiteSpace='nowrap';
    title.style.wordBreak='keep-all';
    title.style.overflowWrap='normal';
    title.style.textOverflow='clip';
    title.style.overflow='visible';
    title.style.lineHeight='.98';
    title.style.letterSpacing=hasLatin?'-.95px':'-.8px';
    title.style.width=available+'px';
    title.style.maxWidth=available+'px';
    title.style.fontSize=defaultSize+'px';

    // Keep the default size when it fits. Only shrink when it would exceed bounds.
    if (title.scrollWidth<=available+1) return;

    let lo=minSize, hi=defaultSize, best=minSize;
    for (let i=0;i<22;i++) {
      const mid=(lo+hi)/2;
      title.style.fontSize=mid+'px';
      if (title.scrollWidth<=available+1) { best=mid; lo=mid; }
      else { hi=mid; }
    }
    title.style.fontSize=Math.floor(best)+'px';
  });
}
function createMetaChip(text,cls='') {
  const span=document.createElement('span');
  span.className='meta-chip '+cls;
  span.textContent=text;
  return span;
}
function getClassColor(key) {
  const draftPanel=document.getElementById('style-panel');
  const activeStyle=stylePanelDraft&&draftPanel?.classList.contains('style-draft-dirty')
    ? stylePanelDraft
    : applicationData;
  return normalizeProAccent(activeStyle.proAccent);
}
function renderList(week,curIdx,nxtIdx,curDay,isDayFinished) {
  const list=document.getElementById('schedule-list');
  if (!list) return;
  list.classList.remove('animate-list');
  void list.offsetWidth;
  list.classList.add('animate-list');
  const tomorrow=getNextSchoolDay(curDay);
  document.querySelectorAll('.nav-item').forEach(btn=>{
    const day=parseInt(btn.dataset.day,10);
    btn.classList.toggle('active',day===viewDay);
    btn.classList.toggle('is-today',day===curDay);
    btn.classList.toggle('is-tomorrow',isDayFinished&&day===tomorrow);
  });

  list.innerHTML='';
  const rows=runtimeSchedule[viewDay]||[];
  rows.forEach((c,i)=>{
    const isToday=(viewDay===(window.MANUALLY_TEST?window.TEST_DAY:curDay));
    const info=processSplitName(c,week);
    const isNow=isToday&&i===curIdx;
    const isNext=isToday&&i===nxtIdx;
    const row=document.createElement('div');
    row.className=`row ${isNow?'is-now':''} ${isNext?'is-next':''}`.trim();
    row.style.setProperty('--class-color',getClassColor(c.key));
    row.style.setProperty('--row-i',String(i));
    row.tabIndex=0;
    row.role='button';
    row.addEventListener('click',()=>openModal(c));
    row.addEventListener('keydown',event=>{
      if (event.key==='Enter'||event.key===' ') { event.preventDefault(); openModal(c); }
    });

    const badge=document.createElement('div');
    badge.className='period-badge';
    badge.textContent=String(i+1);
    const content=document.createElement('div');
    content.className='content';
    const name=document.createElement('div');
    name.className='row-name';
    name.append(document.createTextNode(info.n+' '));
    if (info.label) {
      const labelWrap=document.createElement('span');
      labelWrap.innerHTML=info.label;
      name.append(labelWrap);
    }
    if (isNow||isNext) {
      const tag=document.createElement('span');
      tag.className='status-tag';
      tag.textContent=isNow?'進行中':'下一節';
      name.append(tag);
    }
    const meta=document.createElement('div');
    meta.className='row-meta';
    meta.append(createMetaChip(`${c.s} – ${c.e}`,'meta-time'));
    if (info.t) meta.append(createMetaChip(info.t,'meta-teacher'));
    if (c.loc) {
      const locationChip=createMetaChip(c.loc,'meta-location');
      locationChip.style.setProperty('--class-color',getClassColor(c.key));
      meta.append(locationChip);
    }
    content.append(name,meta);
    row.append(badge,content);
    list.appendChild(row);
  });
  if (!rows.length) {
    const empty=document.createElement('div');
    empty.className='row';
    empty.innerHTML='<div class="period-badge">×</div><div class="content"><div class="row-name">這天沒有課</div><div class="row-meta"><span class="meta-chip">可以休息或安排自習</span></div></div>';
    list.appendChild(empty);
  }
  keepActiveClassVisible(list,isDayFinished,`${viewDay}-${curIdx}-${nxtIdx}-${isDayFinished}`);
}
window.addEventListener('resize',()=>fitNowTitleText(true));
window.addEventListener('orientationchange',()=>setTimeout(()=>fitNowTitleText(true),120));
window.addEventListener('load',()=>fitNowTitleText(true));


/* Test mode advances from one clock tick; the consolidated controller handles input changes. */
function mainClockTick() {
  if (window.MANUALLY_TEST && window.IS_SIMULATING) {
    window.TEST_TIME_SEC=((window.TEST_TIME_SEC||0)+1)%86400;
    const slider=document.getElementById('test-time-slider');
    if (slider) slider.value=Math.floor(window.TEST_TIME_SEC/60);
  }
  update();
}


// ---- js/gemini-ocr.js ----
// Loads a chosen photo into a plain canvas at its native colour (no destructive filtering),
// capped to a sane max dimension so later steps stay fast.
class ImagePreprocessor {
  async process(file) {
    if (!(file instanceof Blob)) throw new Error('請選擇一張圖片。');
    if (!file.type.startsWith('image/')) throw new Error('請選擇支援的圖片格式。');
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('圖片載入失敗，請換一張再試。'));
        element.src = url;
      });
      if (image.naturalWidth < 240 || image.naturalHeight < 160) throw new Error('圖片解析度過低，請換一張更清楚的照片。');
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return { canvas, width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Downscales a canvas in place so the JPEG payload sent to the AI stays small; a no-op if
// the canvas is already within bounds.
function capCanvasDimension(canvas, maxDimension = 1600) {
  const scale = Math.min(1, maxDimension / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas;
  const scaled = document.createElement('canvas');
  scaled.width = Math.max(1, Math.round(canvas.width * scale));
  scaled.height = Math.max(1, Math.round(canvas.height * scale));
  scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}

// True while a Gemini OCR request is in flight; the editor sheet checks this to block
// closing mid-recognition (closing would abandon the in-progress import silently).
let isOcrProcessing = false;

// Gemini API keys are user-supplied and kept only in this browser's localStorage; never
// hardcode a real key in this file (it would be exposed to anyone who opens/shares it).
const GEMINI_API_KEY_STORAGE_KEY = 'orbitAiGeminiApiKey';

function getStoredGeminiApiKey() {
  try { return (localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '').trim(); } catch { return ''; }
}

function setStoredGeminiApiKey(key) {
  try {
    if (key) localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
    else localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch { /* localStorage unavailable (private browsing, etc.) */ }
}

class AIVisionProcessor {
  constructor() {
    // Ordered for the best balance of accuracy and speed on this structured-extraction task:
    // gemini-3.6-flash (newest GA, strong accuracy + token efficiency) is tried first, then
    // gemini-3.7-flash (strong general reasoning) and gemini-2.5-flash (proven, stable) as
    // capable fallbacks, with the flash-lite variant last since it favors speed over accuracy.
    this.geminiModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
  }

  buildPrompt() {
    return `Extract the class timetable from this photo and return it as a single JSON object. Focus on the timetable only — ignore background, margins, decorations, and unrelated content; it may only occupy part of the frame.

Return valid JSON only, matching this exact schema:
{
  "bellTimes": [],
  "breakTimes": [{"name":"午休","start":"12:00","end":"13:00"}],
  "teacherDB": {"國文": ["國文", "陳老師", "A101"], "英文": ["英文", "王老師", "B202"]},
  "locationDB": {"國文":"A101", "英文":"B202"},
  "weeklySchedule": {"1": ["國文","英文",null], "2": [], "3": [], "4": [], "5": []},
  "reverseWeek": false,
  "countdownEvents": [{"name":"116 學測","startDate":"2027-01-22","endDate":"2027-01-24"}]
}

Interpret the timetable visually and use your best judgment to reconstruct its structure. Rules:
- Read class period times from the image when available. Use 24-hour "HH:MM" strings, one entry per period in order, exactly as shown (either ["08:10","09:00"] or {"start":"08:10","end":"09:00"} is acceptable). Preserve the actual times; never invent, guess, or fall back to standard/default school times. If no class times are visible anywhere, return an empty bellTimes array.
- Identify visible subjects, teachers, classrooms, breaks, and other timetable information.
- teacherDB: one entry per distinct subject actually visible in the photo — do not invent subjects that aren't shown. Use the subject's Chinese name as its own key in this object; if two subjects share the same name, make the keys distinct (e.g. append the teacher's name). Value is [full subject name, teacher name, classroom]. Use "" for teacher/location when that information is not readable.
- locationDB maps each subject key to its visible classroom/location; use "" when not visible.
- weeklySchedule: keys "1" through "5" (Monday–Friday) are REQUIRED and must all be present, even as an empty array — never omit or truncate "5" (Friday) even if it is partially cut off in the photo. Add "6" (Saturday) and/or "0" (Sunday) ONLY if the photo actually shows a column for that day; otherwise omit them entirely. Keep each day's array aligned with the detected periods (one entry per bellTimes index). Use null when a slot is genuinely empty or cannot be identified; every non-null entry must be a key that exists in teacherDB.
- If odd/even weeks contain alternatives in the same slot, combine them with "/" (e.g. "國文/公民") and do the same for the corresponding teacher names, using one shared key for that slot.
- Set reverseWeek to true only when the photo clearly indicates a reversed odd/even week orientation; otherwise false.
- Add breakTimes only for explicitly shown non-class periods such as lunch or cleaning — not empty/free periods.
- Add countdownEvents only for clearly visible events/exams with a readable calendar date, formatted as "YYYY-MM-DD". Set startDate and endDate to the same date for a single-day event; use the visible first and last dates for a multi-day event/exam period. Only include dates you can actually read; otherwise return an empty array.
- Do not invent information. When uncertain, prefer an empty value or null.
- Keep all fields internally consistent.
- Return ONLY the raw JSON object — no markdown fences, no comments, no extra text.`;
  }

  // This is plain structured extraction (read the photo, fill in a fixed schema) — it gets
  // no benefit from the models' default "thinking" pass, which only adds latency. Gemini 2.5
  // models take a thinkingBudget (0 disables it); Gemini 3 models replaced that with
  // thinkingLevel and don't support turning thinking fully off, so "low" is the fastest they offer.
  buildGenerationConfig(model) {
    const base = { response_mime_type: 'application/json', temperature: 0.1, maxOutputTokens: 8192 };
    base.thinkingConfig = /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
    return base;
  }

  async recognizeSchedule(canvas, apiKey, onProgress) {
    const report = (message) => { try { onProgress?.(message); } catch { /* ignore progress callback errors */ } };
    const trimmedKey = String(apiKey || '').trim();
    if (!trimmedKey) throw new Error('請先輸入 Gemini API 金鑰。');

    report('正在壓縮並編碼圖片…');
    const base64Data = canvas.toDataURL('image/jpeg', 0.9).replace(/^data:image\/jpeg;base64,/, '');
    const promptPart = { text: this.buildPrompt() };
    const imagePart = { inline_data: { mime_type: 'image/jpeg', data: base64Data } };

    let lastError = null;
    for (const model of this.geminiModels) {
      report(`正在請求 AI 模型（${model}）分析課表…`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(trimmedKey)}`;
      const requestBody = JSON.stringify({
        contents: [{ parts: [promptPart, imagePart] }],
        generationConfig: this.buildGenerationConfig(model)
      });
      let response;
      try {
        response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody });
      } catch (networkError) {
        lastError = new Error(`無法連線至 AI 服務：${networkError.message}`);
        report(`連線失敗，準備改用下一個模型…`);
        continue;
      }
      if (response.ok) {
        report(`AI 已回應（使用模型：${model}），正在解析辨識結果…`);
        return { candidate: this.parseResponse(await response.json()), modelUsed: model };
      }

      const errorJson = await response.json().catch(() => ({}));
      const message = errorJson.error?.message || response.statusText;
      if (response.status === 400 && /API_KEY_INVALID/.test(message)) {
        throw new Error('Gemini API 金鑰無效，請確認後重新輸入。');
      }
      // Retryable on the next model: retired/unknown model (404), overloaded (503), rate-limited (429), or transient server errors (5xx).
      lastError = new Error(`AI 辨識請求失敗（${response.status}）：${message}`);
      const retryableStatus = response.status === 404 || response.status === 429 || response.status === 503 || response.status >= 500;
      if (!retryableStatus) throw lastError;
      report(`模型（${model}）暫時無法使用（${response.status}：${message}），準備改用下一個模型…`);
    }

    throw lastError || new Error('AI 辨識請求失敗：沒有可用的模型。');
  }

  parseResponse(responseData) {
    const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('AI 沒有回傳任何課表內容，請換一張更清楚的照片再試。');
    // Ignore any surrounding features unrelated to the JSON itself (markdown fences, stray
    // commentary before/after) — isolate just the outermost {...} object and read that.
    const fenceStripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const firstBrace = fenceStripped.indexOf('{');
    const lastBrace = fenceStripped.lastIndexOf('}');
    const cleaned = (firstBrace !== -1 && lastBrace > firstBrace) ? fenceStripped.slice(firstBrace, lastBrace + 1) : fenceStripped;
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`AI 回傳的內容不是有效的 JSON：${error.message}`);
    }
    return this.normalizeAIOutput(parsed);
  }

  normalizeAIOutput(aiResult) {
    const normalizeTime=value=> {
      const match=String(value||'').trim().replace(/[：。．]/g,':').match(/^(\d{1,2})\s*:\s*(\d{2})$/);
      if (!match) return '';
      const hours=Number(match[1]), minutes=Number(match[2]);
      return hours>=0&&hours<=23&&minutes>=0&&minutes<=59?`${String(hours).padStart(2,'0')}:${match[2]}`:'';
    };
    const bellTimes = [];
    if (Array.isArray(aiResult.bellTimes)) {
      aiResult.bellTimes.forEach(item => {
        if ((Array.isArray(item) && item.length >= 2) || (item && typeof item === 'object')) {
          const s = normalizeTime(Array.isArray(item)?item[0]:item.start);
          const e = normalizeTime(Array.isArray(item)?item[1]:item.end);
          if (s && e) bellTimes.push([s, e]);
        }
      });
    }

    const breakTimes = [];
    if (Array.isArray(aiResult.breakTimes)) {
      aiResult.breakTimes.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const name = String(item.name || '').trim() || '午休';
        const start = normalizeTime(item.start);
        const end = normalizeTime(item.end);
        if (start && end) breakTimes.push({ name, start, end });
      });
    }

    // Keep the AI parser aligned to the current schema: direct property access only.
    // The AI's own keys are only used to cross-reference locationDB/weeklySchedule
    // entries during this parse - the app never shows or edits a class's key, so the
    // internal id generated here doesn't need to be human-readable.
    const teacherDB = {};
    const locationDB = {};
    const keyMap = {};
    let courseCounter = 1;
    if (aiResult.teacherDB && typeof aiResult.teacherDB === 'object') {
      Object.entries(aiResult.teacherDB).forEach(([dbKey, val]) => {
        let subject = '';
        let teacher = '';
        let location = '';

        if (Array.isArray(val)) {
          subject = String(val[0] || dbKey).trim();
          teacher = String(val[1] || '').trim();
          location = String(val[2] || '').trim();
        } else if (val && typeof val === 'object') {
          subject = String(val.subject || dbKey).trim();
          teacher = String(val.teacher || '').trim();
          location = String(val.location || '').trim();
        } else {
          subject = String(val || dbKey).trim();
        }

        if (!subject) return;

        subject = subject.replace(/／/g, '/');
        teacher = teacher.replace(/／/g, '/');
        location = location.replace(/／/g, '/');

        const key = `oc${courseCounter++}`;
        keyMap[String(dbKey || '').trim().replace(/／/g, '/')] = key;
        teacherDB[key] = [subject, teacher, location];
        locationDB[key] = location;
      });
    }
    if (aiResult.locationDB && typeof aiResult.locationDB === 'object') {
      Object.entries(aiResult.locationDB).forEach(([dbKey, value]) => {
        const key = keyMap[String(dbKey || '').trim().replace(/／/g, '/')];
        if (key) locationDB[key] = String(value || '').trim();
      });
    }

    const weeklySchedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const rawWeekly = aiResult.weeklySchedule ?? {};
    [0, 1, 2, 3, 4, 5, 6].forEach(dayKey => {
      const dayArr = rawWeekly[dayKey] ?? rawWeekly[String(dayKey)];
      if (!Array.isArray(dayArr)) return;
      weeklySchedule[dayKey] = dayArr.map(item => {
        if (!item) return '';
        const rawItemKey = (typeof item === 'string' ? item.trim() : String(item.key || '').trim()).replace(/／/g, '/');
        return keyMap[rawItemKey] || '';
      });
    });

    const recognizedBlocks = [];
    [0, 1, 2, 3, 4, 5, 6].forEach(day => {
      const daySchedule = weeklySchedule[day] || [];
      daySchedule.forEach((code, period) => {
        if (code && teacherDB[code]) {
          recognizedBlocks.push({
            id: `${period}:${day}`,
            day,
            period,
            assignment: { key: code, subject: teacherDB[code][0], teacher: teacherDB[code][1] },
            assignmentStatus: 'assigned',
            confidence: 99
          });
        }
      });
    });

    const candidate = {
      teacherDB,
      teacherOrder: Object.keys(teacherDB),
      locationDB,
      weeklySchedule,
      bellTimes,
      breakTimes,
      reverseWeek: aiResult.reverseWeek === true,
      recognizedBlocks
    };
    candidate.countdownEvents = Array.isArray(aiResult.countdownEvents)
      ? normalizeCountdownEvents(aiResult.countdownEvents)
      : [];
    return candidate;
  }
}

class DataValidator {
  validate(candidate) {
    const errors = [];
    if (!candidate || typeof candidate !== 'object') {
      errors.push('AI 沒有回傳有效的課表資料。');
      return { valid: false, errors };
    }
    const hasCountdown=Array.isArray(candidate.countdownEvents)&&candidate.countdownEvents.length>0;
    const hasClasses=Object.keys(candidate.teacherDB||{}).length>0;
    if (!hasClasses&&!hasCountdown) errors.push('沒有辨識到課程或倒數日期。');
    if (!Array.isArray(candidate.bellTimes)) errors.push('節次時間資料格式不正確。');
    if (candidate.bellTimes?.some(time => !Array.isArray(time) || time.length !== 2 || !/^\d{2}:\d{2}$/.test(time[0]) || !/^\d{2}:\d{2}$/.test(time[1]) || time[0] >= time[1])) errors.push('部分節次時間格式不正確。');
    if (!candidate.weeklySchedule || Object.values(candidate.weeklySchedule).some(day => !Array.isArray(day))) errors.push('課表資料格式不正確。');
    return { valid: errors.length === 0, errors };
  }
}

class ImportPreview {
  constructor(root, onImport) {
    this.root = root;
    this.onImport = onImport;
  }

  render(candidate, validation) {
    this.root.hidden = false;
    const teacherDB = candidate.teacherDB || {};
    const bellTimes = Array.isArray(candidate.bellTimes) ? candidate.bellTimes : [];
    const breakTimes = Array.isArray(candidate.breakTimes) ? candidate.breakTimes : [];
    const classRecords = Object.entries(teacherDB);
    const recognizedBlocks = candidate.recognizedBlocks || [];
    const assignmentBySlot = new Map(recognizedBlocks.map(block => [`${block.day}:${block.period}`, block.assignment?.key || '']));

    const previewTemplate = document.getElementById('ocr-preview-template');
    this.root.replaceChildren(previewTemplate.content.cloneNode(true));
    this.root.querySelector('[data-ocr-preview-meta]').textContent = '請確認並視需要修改下方內容，再按下方按鈕匯入。';

    const bellList = this.root.querySelector('[data-ocr-bell-list]');
    bellTimes.forEach((time, index) => {
      const row = document.getElementById('ocr-bell-row-template').content.cloneNode(true);
      row.querySelector('.bell-num').textContent = index + 1;
      row.querySelector('[data-field="bell-start"]').value = time[0] || '';
      row.querySelector('[data-field="bell-end"]').value = time[1] || '';
      bellList.appendChild(row);
    });

    const breakList = this.root.querySelector('[data-ocr-break-list]');
    const breakFold = this.root.querySelector('[data-ocr-break-fold]');
    if (breakFold && !breakTimes.length) breakFold.remove();
    breakTimes.forEach(item => {
      const row = document.getElementById('ocr-break-row-template').content.cloneNode(true);
      row.querySelector('.break-name').value = item.name || '午休';
      row.querySelector('.break-start').value = item.start || '';
      row.querySelector('.break-end').value = item.end || '';
      breakList.appendChild(row);
    });
    const bellFold = this.root.querySelector('[data-ocr-bell-fold]');
    if (bellFold && !bellTimes.length) bellFold.remove();

    const classList = this.root.querySelector('[data-ocr-class-list]');
    const subjectCounts = {};
    classRecords.forEach(([, value]) => { subjectCounts[value[0]] = (subjectCounts[value[0]]||0)+1 });
    classRecords.forEach(([key, value]) => {
      const row = document.getElementById('ocr-class-row-template').content.cloneNode(true);
      const card = row.querySelector('.ocr-import-class-card');
      card.dataset.origKey = key;
      row.querySelector('[data-field="class-subject"]').value = value[0] || '';
      row.querySelector('.tc-teacher').value = value[1] || '';
      row.querySelector('.tc-location').value = candidate.locationDB?.[key] || '';
      updateTeacherCardAvatar(card);
      classList.appendChild(row);
    });
    const classFold = this.root.querySelector('[data-ocr-class-fold]');
    if (classFold && !classRecords.length) classFold.remove();

    const weekdayLabels = { 0: '週日', 1: '週一', 2: '週二', 3: '週三', 4: '週四', 5: '週五', 6: '週六' };
    const weeklySchedule = candidate.weeklySchedule || {};
    const extraDays = [6, 0].filter(day => (weeklySchedule[day] || []).some(Boolean));
    const days = [1, 2, 3, 4, 5, ...extraDays];
    const assignmentGrid = this.root.querySelector('[data-ocr-assignment-grid]');
    days.forEach(day => {
      const row = document.getElementById('ocr-day-row-template').content.cloneNode(true);
      row.querySelector('.schedule-day-row').dataset.day = day;
      row.querySelector('.schedule-day-label').textContent = weekdayLabels[day];
      const periods = row.querySelector('.schedule-periods');
      bellTimes.forEach((time, period) => {
        const select = document.createElement('select');
        select.className = 'period-select';
        select.dataset.assignmentDay = day;
        select.dataset.assignmentPeriod = period;
        select.title = time.join('–');
        select.appendChild(new Option('-', ''));
        classRecords.forEach(([key, value]) => select.appendChild(new Option(formatClassLabel(value[0], value[1], subjectCounts[value[0]]>1), key)));
        select.value = assignmentBySlot.get(`${day}:${period}`) || '';
        periods.appendChild(select);
      });
      assignmentGrid.appendChild(row);
    });
    const assignmentFold = this.root.querySelector('[data-ocr-assignment-fold]');
    if (assignmentFold && (!bellTimes.length || !classRecords.length)) assignmentFold.remove();

    const countdownEvents = Array.isArray(candidate.countdownEvents) ? candidate.countdownEvents : [];
    const countdownFold = this.root.querySelector('[data-ocr-countdown-fold]');
    if (countdownEvents.length) {
      const countdownList = this.root.querySelector('[data-ocr-countdown-list]');
      countdownEvents.forEach(item => {
        const row = document.getElementById('ocr-countdown-row-template').content.cloneNode(true);
        row.querySelector('.ocr-countdown-name').value = item.name || '';
        const startInput = row.querySelector('.ocr-countdown-start');
        const endInput = row.querySelector('.ocr-countdown-end');
        startInput.value = item.startDate || item.date || '';
        endInput.value = item.endDate || item.date || '';
        startInput.addEventListener('change', () => {
          if (!endInput.value || endInput.value < startInput.value) endInput.value = startInput.value;
        });
        countdownList.appendChild(row);
      });
    } else if (countdownFold) {
      countdownFold.remove();
    }

    this.root.querySelector('[data-ocr-preview-note]').textContent = validation.valid
      ? '請確認以上內容無誤，再按下方按鈕匯入。'
      : validation.errors.join('');
    this.root.querySelector('[data-ocr-submit]').hidden = !validation.valid;

    const refreshAssignmentOptions = () => {
      const cards = Array.from(this.root.querySelectorAll('.ocr-import-class-card'));
      const rows = cards.map(card => ({
        key: card.dataset.origKey || '',
        subject: (card.querySelector('[data-field="class-subject"]')?.value || '').trim(),
        teacher: (card.querySelector('.tc-teacher')?.value || '').trim()
      })).filter(row => row.key && row.subject);
      const liveSubjectCounts = {};
      rows.forEach(row => { liveSubjectCounts[row.subject] = (liveSubjectCounts[row.subject]||0)+1 });
      const options = rows.map(row => ({ key: row.key, label: formatClassLabel(row.subject, row.teacher, liveSubjectCounts[row.subject]>1) }));
      this.root.querySelectorAll('[data-assignment-day]').forEach(select => {
        const current = select.value;
        select.replaceChildren(new Option('-', ''));
        options.forEach(option => select.appendChild(new Option(option.label, option.key)));
        select.value = options.some(option => option.key === current) ? current : '';
      });
    };
    this.root.querySelectorAll('.ocr-import-class-card input').forEach(input => input.addEventListener('input', () => {
      const card = input.closest('.ocr-import-class-card');
      if (card) updateTeacherCardAvatar(card);
      refreshAssignmentOptions();
    }));

    this.root.querySelector('[data-ocr-submit]')?.addEventListener('click', () => {
      const edited = { bellTimes: [], breakTimes: [], teacherDB: {}, locationDB: {}, teacherOrder: [], weeklySchedule: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, reverseWeek: candidate.reverseWeek === true };

      this.root.querySelectorAll('[data-ocr-bell-list] .bell-row').forEach(item => {
        const start = (item.querySelector('[data-field="bell-start"]')?.value || '').trim();
        const end = (item.querySelector('[data-field="bell-end"]')?.value || '').trim();
        if (start && end) edited.bellTimes.push([start, end]);
      });

      this.root.querySelectorAll('[data-ocr-break-list] .break-row').forEach(item => {
        const name = (item.querySelector('.break-name')?.value || '').trim() || '午休';
        const start = (item.querySelector('.break-start')?.value || '').trim();
        const end = (item.querySelector('.break-end')?.value || '').trim();
        if (start && end) edited.breakTimes.push({ name, start, end });
      });

      this.root.querySelectorAll('.ocr-import-class-card').forEach(card => {
        const key = (card.dataset.origKey || '').trim();
        const subject = (card.querySelector('[data-field="class-subject"]')?.value || '').trim();
        if (!key || !subject) return;
        const teacher=(card.querySelector('.tc-teacher')?.value || '').trim();
        const location=(card.querySelector('.tc-location')?.value || '').trim();
        edited.teacherDB[key] = [subject, teacher, location];
        edited.locationDB[key] = location;
        edited.teacherOrder.push(key);
      });

      this.root.querySelectorAll('[data-assignment-day]').forEach(select => {
        const day = Number(select.dataset.assignmentDay);
        const period = Number(select.dataset.assignmentPeriod);
        const key = select.value.trim();
        if (key && edited.teacherDB[key]) edited.weeklySchedule[day][period] = key;
      });

      const countdownEvents = [];
      this.root.querySelectorAll('[data-ocr-countdown-list] .bell-row').forEach(item => {
        const name = (item.querySelector('.ocr-countdown-name')?.value || '').trim();
        const startDate = (item.querySelector('.ocr-countdown-start')?.value || '').trim();
        const endDate = (item.querySelector('.ocr-countdown-end')?.value || '').trim();
        if (name && startDate) countdownEvents.push({ name, startDate, endDate: endDate || startDate });
      });
      edited.countdownEvents = countdownEvents;

      this.onImport?.(edited);
    });
  }
}

function mountOCRImporter({ input, runButton, imagePreview, status, result, onImport }) {
  const preprocessor = new ImagePreprocessor();
  const validator = new DataValidator();
  const aiProcessor = new AIVisionProcessor();
  const preview = new ImportPreview(result, onImport);
  let source = null;

  async function loadFile(file) {
    try {
      source = await preprocessor.process(file);
      imagePreview.src = URL.createObjectURL(file);
      imagePreview.hidden = false;
      imagePreview.parentElement?.classList.add('has-image');
      runButton.disabled = false;
      status('已載入圖片，點擊匯入讓 AI 自動判讀課表。');
    } catch (error) {
      status(error.message, true);
    }
  }

  runButton.addEventListener('click', async () => {
    if (!source) return;
    let apiKey = getStoredGeminiApiKey();
    if (!apiKey) {
      apiKey = await promptGeminiApiKey();
      if (!apiKey) return;
    }
    runButton.disabled = true;
    isOcrProcessing = true;
    try {
      const workingCanvas = capCanvasDimension(source.canvas, 1600);

      status('準備圖片中…');
      const { candidate, modelUsed } = await aiProcessor.recognizeSchedule(workingCanvas, apiKey, (message) => status(message));
      status('正在驗證課表資料…');
      const validation = validator.validate(candidate);

      status(validation.valid ? `課表辨識完成（模型：${modelUsed}），請確認下方內容後進行匯入。` : (validation.errors.join('') || 'AI 辨識結果不完整，請手動修正後再匯入。'));
      preview.render(candidate, validation);
    } catch (error) {
      status(error.message, true);
    } finally {
      runButton.disabled = false;
      isOcrProcessing = false;
    }
  });

  return { loadFile };
}

// Shows a one-time modal asking for the Gemini API key; resolves with the trimmed key, or '' if cancelled.
function promptGeminiApiKey() {
  return new Promise(resolve => {
    const overlay = document.getElementById('ocr-apikey-overlay');
    const sheet = document.getElementById('ocr-apikey-sheet');
    const keyInput = document.getElementById('ocr-apikey-input');
    const confirmBtn = document.getElementById('ocr-apikey-confirm');
    const cancelBtn = document.getElementById('ocr-apikey-cancel');

    function close(result) {
      overlay.classList.remove('show');
      sheet.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.onclick = null;
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    }

    function confirm() {
      const key = keyInput.value.trim();
      if (!key) { keyInput.focus(); return; }
      setStoredGeminiApiKey(key);
      close(key);
    }

    keyInput.value = '';
    confirmBtn.onclick = confirm;
    cancelBtn.onclick = () => close('');
    overlay.onclick = () => close('');
    keyInput.onkeydown = event => { if (event.key === 'Enter') confirm(); };
    overlay.classList.add('show');
    sheet.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => keyInput.focus());
  });
}

// Load the importer only when the image-import control is first used.
let ocrImporterPromise;
let ocrImporterController;
function activateOCRImporter() {
  if (ocrImporterPromise) return ocrImporterPromise;
  const input=document.getElementById('ocr-import-image');
  const runButton=document.getElementById('ocr-import-detect');
  const imagePreview=document.getElementById('ocr-import-image-preview');
  const statusElement=document.getElementById('ocr-import-status');
  const result=document.getElementById('ocr-import-result');
  if (!input||!runButton||!imagePreview||!statusElement||!result) return Promise.resolve();
  ocrImporterPromise=new Promise((resolve,reject)=>{
    const config={
      input,
      runButton,
      imagePreview,
      result,
      onImport:data=> {
        try {
          const imported=normalizeSettingsData({
            ...data,
            // AI recognition has no knowledge of the app's visual theme or
            // existing named breaks; retain those editor settings on import.
            breakTimes:(Array.isArray(data.breakTimes)&&data.breakTimes.length)
              ?data.breakTimes
              :settingsDataForExport().breakTimes,
            // A photo recognized with no classes (e.g. one taken just for a countdown date)
            // carries no real signal about odd/even week orientation — keep the existing
            // setting instead of silently resetting it to the AI's unset default.
            reverseWeek:Object.keys(data.teacherDB||{}).length?data.reverseWeek:settingsDataForExport().reverseWeek,
            proAccent:settingsDataForExport().proAccent,
            proSecondary:settingsDataForExport().proSecondary,
            proTertiary:settingsDataForExport().proTertiary,
            styleSlots:settingsDataForExport().styleSlots
          });
          beginEditorImport(settingsDataForExport(),imported,{preserveStyle:true});
        } catch (error) {
          statusElement.textContent=`匯入預覽失敗：${error.message||error}`;
          statusElement.classList.add('error');
        }
      },
      status:(message,error=false)=>{statusElement.textContent=message;statusElement.classList.toggle('error',error)}
    };
    if (typeof mountOCRImporter !== 'function') {
      reject(new Error('OCR importer did not initialize.'));
      return;
    }
    resolve(mountOCRImporter(config));
  }).then(controller=>{ocrImporterController=controller;return controller});
  return ocrImporterPromise;
}
const ocrImageInput=document.getElementById('ocr-import-image');
const ocrImageFilename=document.getElementById('ocr-import-filename');
ocrImageInput?.addEventListener('pointerdown',activateOCRImporter,{once:true});
ocrImageInput?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  if (ocrImageFilename) ocrImageFilename.textContent=file?.name||'尚未選擇檔案';
  const controller=ocrImporterController||await activateOCRImporter();
  await controller?.loadFile(file);
});

// ---- js/bootstrap.js ----
// Runs once every module below has finished defining its functions: loads saved
// settings, builds the runtime schedule from them, applies the saved theme, and
// starts the live clock that drives the dashboard.
let applicationData = loadData();
buildSchedule();
try {
  setStyleMode('pro');
} catch (e) {
}
setInterval(mainClockTick, 1000);
syncTestPlayPauseUi();
syncTestToolbar();
update();

// ---- js/testsim-runtime.js ----
(function(){
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

  var VERSIONED_ASSETS=['css/styles.css','js/app.js'];
  // Fetched with fetch() (async) rather than a synchronous XMLHttpRequest so computing
  // the version hash never blocks page boot — it used to freeze rendering for as long as
  // it took to re-download every source file over the network on every single page load.
  function fetchTextAsync(url){
    var bustedUrl=url+(url.indexOf('?')===-1?'?':'&')+'_v='+Date.now()+Math.random();
    return fetch(bustedUrl,{cache:'no-store'}).then(function(response){
      if (!response.ok) throw new Error('Unable to fetch '+url);
      return response.text();
    });
  }
  function el(id){ return document.getElementById(id); }
  function getAppVersionAsync(){
    var url=window.location.href.replace(/[?#].*$/,'');
    return Promise.all([fetchTextAsync(url)].concat(VERSIONED_ASSETS.map(fetchTextAsync)))
      .then(function(parts){ return parts.join(''); })
      .catch(function(){ return ORBIT_INITIAL_MARKUP; })
      .then(function(source){
        source=source.replace(
          /(<span id="app-version"[^>]*>)[\s\S]*?(<\/span>)/,
          '$1$2'
        );
        var hash=2166136261;
        for (var i=0;i<source.length;i++) {
          hash^=source.charCodeAt(i);
          hash=Math.imul(hash,16777619);
        }
        return (hash>>>0).toString(36).toUpperCase();
      });
  }
  function syncAppVersion(){
    var version=el('app-version');
    if (!version) return;
    getAppVersionAsync().then(function(hash){
      version.textContent='版本 '+hash;
    }).catch(function(){
      version.textContent='版本 未知';
    });
  }
  function clampInt(value, min, max, fallback){
    var n = parseInt(value, 10);
    if (!Number.isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, n));
  }
  function normalizeDay(day){
    var n = parseInt(day, 10);
    if (!Number.isFinite(n)) n = new Date().getDay();
    return ((n % 7) + 7) % 7;
  }
  function normalizeSeconds(seconds){
    var n = Math.round(Number(seconds));
    if (!Number.isFinite(n)) n = DAY_START_SECONDS;
    return ((n % END_OF_DAY_SECONDS) + END_OF_DAY_SECONDS) % END_OF_DAY_SECONDS;
  }
  function selectedDay(){
    return normalizeDay(el('test-day-input') && el('test-day-input').value);
  }
  function resetRenderState(){
    if (typeof viewDay !== 'undefined') viewDay = window.TEST_DAY;
    if (typeof autoAdvancedAfterFinishedDay !== 'undefined') autoAdvancedAfterFinishedDay = null;
    if (typeof lastListKey !== 'undefined') lastListKey = '';
    if (typeof lastAutoScrollKey !== 'undefined') lastAutoScrollKey = '';
  }
  function writeDay(day){
    window.TEST_DAY = normalizeDay(day);
    var dayInput = el('test-day-input');
    if (dayInput) dayInput.value = String(window.TEST_DAY);
    resetRenderState();
  }
  function persistTestState(){
    try {
      if (!window.MANUALLY_TEST) {
        localStorage.removeItem(TEST_STATE_STORAGE_KEY);
        return
      }
      localStorage.setItem(TEST_STATE_STORAGE_KEY,JSON.stringify({
        day:normalizeDay(window.TEST_DAY),
        seconds:Number.isFinite(window.TEST_TIME_SEC)?window.TEST_TIME_SEC:DAY_START_SECONDS,
        simulating:!!window.IS_SIMULATING,
        endOfDayArmed:!!endOfDayArmed,
        pausedAtManualRollover:!!pausedAtManualRollover,
        savedPausedSecond:Number.isFinite(savedPausedSecond)?savedPausedSecond:null,
        savedPausedDay:Number.isFinite(savedPausedDay)?savedPausedDay:null
      }));
    } catch (error) {
      console.warn('Unable to persist test mode state.',error)
    }
  }
  function restoreTestState(){
    try {
      const raw=localStorage.getItem(TEST_STATE_STORAGE_KEY);
      if (!raw) return false;
      const state=JSON.parse(raw);
      if (!state||typeof state!=='object'||typeof state.day!=='number'||typeof state.seconds!=='number') {
        localStorage.removeItem(TEST_STATE_STORAGE_KEY);
        return false
      }
      window.MANUALLY_TEST=true;
      window.TEST_DAY=normalizeDay(state.day);
      window.TEST_TIME_SEC=Math.max(0,Math.min(END_OF_DAY_SECONDS,Math.round(state.seconds)));
      window.IS_SIMULATING=state.simulating===true;
      endOfDayArmed=state.endOfDayArmed===true;
      pausedAtManualRollover=state.pausedAtManualRollover===true;
      savedPausedSecond=Number.isFinite(state.savedPausedSecond)?state.savedPausedSecond:null;
      savedPausedDay=Number.isFinite(state.savedPausedDay)?normalizeDay(state.savedPausedDay):null;
      writeDay(window.TEST_DAY);
      return true
    } catch (error) {
      console.warn('Unable to restore test mode state.',error);
      localStorage.removeItem(TEST_STATE_STORAGE_KEY);
      return false
    }
  }
  function unlockTestControls(){
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
  function setStartOfDayInputs(){
    endOfDayArmed = false;
    var h = el('in-h');
    var m = el('in-m');
    var slider = el('test-time-slider');
    if (h) h.value = '0';
    if (m) m.value = '0';
    if (slider) slider.value = '0';
  }
  function setEndOfDayInputs(){
    endOfDayArmed = true;
    pausedAtManualRollover = false;
    var h = el('in-h');
    var m = el('in-m');
    var slider = el('test-time-slider');
    if (h) h.value = '24';
    if (m) m.value = '0';
    if (slider) slider.value = String(END_OF_DAY_MINUTES);
  }
  function forceStartOfDayInputs(){
    setStartOfDayInputs();
    requestAnimationFrame(function(){
      setStartOfDayInputs();
      setTimeout(setStartOfDayInputs, 0);
      setTimeout(setStartOfDayInputs, 50);
    });
  }
  function clearSavedPausedTime(){
    savedPausedSecond = null;
    savedPausedDay = null;
  }
  function clearSliderEndpointLock(){
    sliderEndpointLock = false;
  }
  function getTypedTargetSeconds(){
    var h = parseInt((el('in-h') || {}).value, 10);
    var m = parseInt((el('in-m') || {}).value, 10);
    if (!Number.isFinite(h)) h = 8;
    if (!Number.isFinite(m)) m = 0;
    if (h >= 24) return END_OF_DAY_SECONDS;
    return Math.max(0, Math.min(23, h)) * 3600 + Math.max(0, Math.min(59, m)) * 60;
  }
  function selectedTargetSeconds(){
    if (pausedAtManualRollover && !window.IS_SIMULATING && Number.isFinite(window.TEST_TIME_SEC) && window.TEST_TIME_SEC < START_LEAD_SECONDS) return window.TEST_TIME_SEC;
    var slider = el('test-time-slider');
    if (endOfDayArmed || (slider && parseInt(slider.value, 10) >= END_OF_DAY_MINUTES)) return END_OF_DAY_SECONDS;
    return getTypedTargetSeconds();
  }
  function setSimSeconds(seconds, opts){
    opts = opts || {};
    unlockTestControls();
    window.TEST_TIME_SEC = normalizeSeconds(seconds);
    if (opts.writeInputs !== false) updateInputDisplay();
    if (opts.writeSlider !== false) {
      var slider = el('test-time-slider');
      if (slider) slider.value = String(Math.floor(window.TEST_TIME_SEC / 60));
    }
  }
  function syncTestChrome(){
    syncTestPlayPauseUi();
    enableExitButton();
    syncTestToolbar();
    syncTestingBody();
  }
  function refreshTestUi(){
    syncTestChrome();
    window.update();
    lastSimSecond = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : null;
  }
  function pauseForEditing(){
    if (window.MANUALLY_TEST || window.IS_SIMULATING) {
      window.MANUALLY_TEST = true;
      window.IS_SIMULATING = false;
      syncTestChrome();
    }
  }
  function setDefaultsToCurrentTime(force){
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
  function mergeNextClassWithTimer(){
    var timeCard = document.querySelector('.dashboard .time-card');
    var nextBox = document.querySelector('.dashboard > .next-box');
    if (!timeCard || !nextBox || timeCard.contains(nextBox)) return;
    timeCard.classList.add('v3-11-next-module');
    timeCard.appendChild(nextBox);
  }
  function patchPanelOpeners(){
    if (panelPatched) return;
    ['toggleTestPanel','openTestPanel'].forEach(function(name){
      var original = window[name];
      window[name] = function(){
        if (!window.MANUALLY_TEST) setDefaultsToCurrentTime(true);
        var result = original.apply(this, arguments);
        setDefaultsToCurrentTime(false);
        return result;
      };
    });
    panelPatched = true;
  }
  function syncCrossDayBeforeRender(){
    if (!window.MANUALLY_TEST || !window.IS_SIMULATING || !Number.isFinite(window.TEST_TIME_SEC)) {
      lastSimSecond = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : null;
      return;
    }
    var currentSecond = window.TEST_TIME_SEC;
    if (lastSimSecond !== null && lastSimSecond >= END_OF_DAY_SECONDS - START_LEAD_SECONDS && currentSecond < START_LEAD_SECONDS) {
      writeDay(normalizeDay(window.TEST_DAY) + 1);
      endOfDayArmed = false;
      setStartOfDayInputs();
      syncTestChrome();
      currentSecond = 0;
    }
    lastSimSecond = currentSecond;
  }
  function getTestAwareNow(){
    var now = new Date();
    if (window.MANUALLY_TEST && Number.isFinite(window.TEST_TIME_SEC)) {
      now.setHours(Math.floor(window.TEST_TIME_SEC / 3600));
      now.setMinutes(Math.floor((window.TEST_TIME_SEC % 3600) / 60));
      now.setSeconds(Math.floor(window.TEST_TIME_SEC % 60));
      now.setMilliseconds(0);
    }
    return now;
  }
  function applyDashboardState(){
    var dashboard = document.querySelector('.dashboard');
    if (!dashboard || typeof runtimeSchedule === 'undefined') return;
    var now = getTestAwareNow();
    var curDay = window.MANUALLY_TEST ? normalizeDay(window.TEST_DAY) : now.getDay();
    var today = runtimeSchedule[curDay] || [];
    var firstClass = today[0];
    var lastClass = today[today.length - 1];
    var mins = now.getHours() * 60 + now.getMinutes();
    var hasParser = typeof parseTime === 'function';
    var finishedSchoolDay = !!(hasParser && lastClass && mins >= parseTime(lastClass.e));
    var outsideClassRange = !!(hasParser && firstClass && lastClass && (mins < parseTime(firstClass.s) || mins >= parseTime(lastClass.e)));
    // True once nothing on today's schedule still starts after now, even mid-way through the
    // last class or its trailing break — not just once the whole day is over. Without this, the
    // dashboard kept showing an empty "next class" panel throughout the entire last period.
    var hasUpcomingClass = today.some(function(c){ return hasParser && parseTime(c.s) > mins; });
    var noUpcomingClass = !!(today.length && !hasUpcomingClass && !finishedSchoolDay && !outsideClassRange);
    dashboard.classList.toggle('v3-15-day-finished', finishedSchoolDay);
    dashboard.classList.toggle('v3-16-outside-class-range', outsideClassRange);
    dashboard.classList.toggle('orbit-no-school-day', !today.length);
    dashboard.classList.toggle('orbit-no-upcoming-class', noUpcomingClass);
  }
  function syncTestingBody(){
    if (document.body) document.body.classList.toggle('testing', !!(window.MANUALLY_TEST || window.IS_SIMULATING));
  }
  function finishBoot(){
    if (document.body) document.body.classList.remove('orbit-booting');
  }
  function suppressListAnimationForThisFrame(){
    if (!document.body) return;
    document.body.classList.add('orbit-suppress-list-animation');
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        if (document.body) document.body.classList.remove('orbit-suppress-list-animation');
      });
    });
  }
  function patchUpdate(){
    if (updatePatched || typeof window.update !== 'function') return;
    var originalUpdate = window.update;
    window.update = function(){
      var wasTesting = lastTestingState;
      var isTesting = !!(window.MANUALLY_TEST || window.IS_SIMULATING);
      if (wasTesting && !isTesting) suppressListAnimationForThisFrame();
      syncCrossDayBeforeRender();
      var result = originalUpdate.apply(this, arguments);
      if (endOfDayArmed && window.MANUALLY_TEST && window.IS_SIMULATING && Number.isFinite(window.TEST_TIME_SEC) && window.TEST_TIME_SEC >= END_OF_DAY_SECONDS - START_LEAD_SECONDS) {
        setEndOfDayInputs();
      }
      if (pausedAtManualRollover && window.MANUALLY_TEST && !window.IS_SIMULATING && Number.isFinite(window.TEST_TIME_SEC) && window.TEST_TIME_SEC < START_LEAD_SECONDS) {
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
  function enableExitButton(){
    var exit = el('test-exit-btn');
    if (!exit) return;
    exit.disabled = false;
    exit.removeAttribute('disabled');
    exit.style.opacity = '1';
  }
  window.updateInputDisplay = function(){
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

  window.syncTestFromSlider = function(){
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
    setSimSeconds(clampInt(slider && slider.value, 0, END_OF_DAY_MINUTES - 1, 8 * 60) * 60, { writeInputs:true, writeSlider:false });
    refreshTestUi();
  };

  window.syncTestFromInputs = function(){
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
    setSimSeconds(getTypedTargetSeconds(), { writeInputs:false, writeSlider:true });
    refreshTestUi();
  };

  window.syncTestDayChange = function(){
    clearSavedPausedTime();
    endOfDayArmed = false;
    pausedAtManualRollover = false;
    pauseForEditing();
    writeDay(selectedDay());
    setSimSeconds(DAY_START_SECONDS, { writeInputs:true, writeSlider:true });
    refreshTestUi();
  };

  function startManualEndpointRun(day){
    writeDay(day);
    window.MANUALLY_TEST = true;
    window.IS_SIMULATING = true;
    window.TEST_TIME_SEC = END_OF_DAY_SECONDS - START_LEAD_SECONDS;
    endOfDayArmed = true;
    pausedAtManualRollover = false;
    setEndOfDayInputs();
    refreshTestUi();
  }

  window.toggleTestPlayPause = function(event){
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
      setSimSeconds(targetSeconds - START_LEAD_SECONDS, { writeInputs:false, writeSlider:true });
    } else {
      window.IS_SIMULATING = false;
      savedPausedSecond = Number.isFinite(window.TEST_TIME_SEC) ? window.TEST_TIME_SEC : null;
      savedPausedDay = normalizeDay(window.TEST_DAY);
    }
    if (!(window.MANUALLY_TEST && window.IS_SIMULATING)) endOfDayArmed = false;
    refreshTestUi();
    return false;
  };

  window.exitTestMode = function(){
    window.MANUALLY_TEST = false;
    window.IS_SIMULATING = false;
    endOfDayArmed = false;
    pausedAtManualRollover = false;
    clearSavedPausedTime();
    try { localStorage.removeItem(TEST_STATE_STORAGE_KEY) } catch (error) { console.warn('Unable to clear test mode state.',error) }
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
  window.forceAppRefresh = function(){
    var url = new URL(window.location.href);
    url.searchParams.set('refresh', String(Date.now()));
    window.location.replace(url.toString());
  };

  function bindPlayButton(){
    var oldBtn = el('test-play-pause-btn');
    if (!oldBtn || (oldBtn.dataset && oldBtn.dataset.orbitConsolidatedBound === '1')) return;
    var btn = oldBtn.cloneNode(true);
    btn.removeAttribute('onclick');
    btn.onclick = null;
    btn.dataset.orbitConsolidatedBound = '1';
    oldBtn.parentNode.replaceChild(btn, oldBtn);
    btn.addEventListener('click', window.toggleTestPlayPause, true);
  }
  function bindExitButtons(){
    var exit = el('test-exit-btn');
    if (exit && !exit.orbitConsolidatedBound) {
      exit.disabled = false;
      exit.removeAttribute('disabled');
      exit.addEventListener('click', function(event){
        event.preventDefault();
        event.stopPropagation();
        window.exitTestMode();
      }, true);
      exit.orbitConsolidatedBound = true;
    }
  }
  function bindInputPauses(){
    ['in-h','in-m','test-day-input'].forEach(function(id){
      var node = el(id);
      if (!node || node.orbitConsolidatedPauseBound) return;
      node.addEventListener('focus', pauseForEditing, true);
      node.addEventListener('input', pauseForEditing, true);
      node.orbitConsolidatedPauseBound = true;
    });
    var slider = el('test-time-slider');
    if (slider && !slider.orbitEndpointLockBound) {
      ['pointerup','mouseup','touchend','keyup','blur','change'].forEach(function(eventName){
        slider.addEventListener(eventName, clearSliderEndpointLock, true);
      });
      slider.orbitEndpointLockBound = true;
    }
  }
  function init(){
    mergeNextClassWithTimer();
    unlockTestControls();
    syncAppVersion();
    var restoredTestState = restoreTestState();
    if (!defaultsInitialized && !restoredTestState) {
      setDefaultsToCurrentTime(true);
      defaultsInitialized = true;
    }
    if (restoredTestState) {
      updateInputDisplay();
      var slider=el('test-time-slider');
      if (slider) slider.value=String(Math.floor(window.TEST_TIME_SEC/60));
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
