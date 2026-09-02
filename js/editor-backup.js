// Reads the editor form and converts it into the app data shape.
function collectEditorFormState()  {
  const newDB=  {
  },
  newLoc=  {
  };
  document.querySelectorAll('#teacher-list .teacher-card').forEach(card=>  {
    const key=card.querySelector('.tc-key').value.trim(),
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
    date:row.querySelector('.countdown-event-date')?.value
  })).filter(event=>event.name&&event.date);
  const normalizedCountdownEvents=normalizeCountdownEvents(countdownEvents);
  const proAccent=normalizeProAccent(applicationData.proAccent);
  const derivedProColors=deriveProSupportColors(proAccent);
  const proSecondary=normalizeProSecondary(applicationData.proSecondary||derivedProColors.secondary);
  const proTertiary=derivedProColors.tertiary;
  return  {
    teacherDB: newDB, teacherOrder:Array.from(document.querySelectorAll('#teacher-list .teacher-card')).map(card=>card.querySelector('.tc-key').value.trim()).filter(Boolean), locationDB: newLoc, weeklySchedule: newWeekly, bellTimes: newBells,
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
    card.querySelector('.tc-key').value,
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
// Transfer backups use short keys and compressed Base64 to stay easy to copy.
const TRANSFER_KEYS={teacherDB:'a',locationDB:'b',weeklySchedule:'c',bellTimes:'d',breakTimes:'e',countdownEvents:'f',reverseWeek:'h',proAccent:'i',proSecondary:'j',proTertiary:'k',styleSlots:'l',bellRowsDraft:'m',breakRowsDraft:'n',teacherCardsDraft:'o',geminiApiKey:'t',__orbit:'p',app:'q',schema:'r'};
const TRANSFER_KEYS_REVERSE=Object.fromEntries(Object.entries(TRANSFER_KEYS).map(([key,value])=>[value,key]));
const TRANSFER_START='===== ORBIT COLOR SETTINGS BACKUP BEGIN =====\n';
const TRANSFER_END='\n===== ORBIT COLOR SETTINGS BACKUP END =====';
function compactTransferValue(value,expand=false) {
  if (Array.isArray(value)) return value.map(item=>compactTransferValue(item,expand));
  if (!value||typeof value!=='object') return value;
  return Object.fromEntries(Object.entries(value).map(([key,item])=> {
    const mapped=expand?(TRANSFER_KEYS_REVERSE[key]||key):(TRANSFER_KEYS[key]||key);
    return [mapped,compactTransferValue(item,expand)]
  }))
}
function transferBytesToBase64(bytes) {
  let binary='';
  for (let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary)
}
function transferBase64ToBytes(value) {
  const binary=atob(value);
  return Uint8Array.from(binary,char=>char.charCodeAt(0))
}
async function encodeTransferData(data) {
  const raw=JSON.stringify(compactTransferValue(data));
  if (typeof CompressionStream==='function') {
    const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
    const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    const encoded=transferBytesToBase64(bytes);
    return TRANSFER_START+encoded+TRANSFER_END
  }
  throw new Error('此裝置不支援壓縮匯出。')
}
async function decodeTransferData(text) {
  const value=String(text||'').trim();
  const wrapped=value.startsWith(TRANSFER_START)&&value.endsWith(TRANSFER_END);
  if (!wrapped) throw new Error('請貼上 Orbit Color 課表設定備份。');
  const encoded=value.slice(TRANSFER_START.length,-TRANSFER_END.length).trim();
  if (typeof DecompressionStream!=='function') throw new Error('此裝置不支援壓縮匯入。');
  if (!encoded||!/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('請貼上 Orbit Color 課表設定備份，或只貼上壓縮內容。');
  const stream=new Blob([transferBase64ToBytes(encoded)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return compactTransferValue(JSON.parse(await new Response(stream).text()),true)
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
  return details?`${key} (${details})`:String(key)
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
function describeSettingsDiff(current,next,renameChanges=[],{isImport=false}={}) {
  const lines=[];
  const confirmedRenames=(renameChanges||[]).filter(change=>
    change&&change.oldKey&&change.newKey&&change.oldKey!==change.newKey&&
    (current.teacherDB||{})[change.oldKey]&&(next.teacherDB||{})[change.newKey]
  );
  const renamedOldKeys=new Set(confirmedRenames.map(change=>change.oldKey));
  const renamedNewKeys=new Set(confirmedRenames.map(change=>change.newKey));
  const isRenameScheduleChange=(before,after)=>confirmedRenames.some(change=>change.oldKey===before&&change.newKey===after);
  const teacherItems=[];
  confirmedRenames.forEach(change=> {
    const before=(current.teacherDB||{})[change.oldKey]||[];
    const after=(next.teacherDB||{})[change.newKey]||[];
    const label=after[0]||before[0]||change.newKey;
    teacherItems.push(`${label} 縮寫：${change.oldKey} -> ${change.newKey}`);
    if ((before[0]||'')!==(after[0]||'')) teacherItems.push(`${change.newKey} 科目：${formatDiffValue(before[0])} -> ${formatDiffValue(after[0])}`);
    if ((before[1]||'')!==(after[1]||'')) teacherItems.push(`${change.newKey} 老師：${formatDiffValue(before[1])} -> ${formatDiffValue(after[1])}`)
  });
  const teacherKeys=[...new Set(Object.keys(current.teacherDB||{}).concat(Object.keys(next.teacherDB||{})))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
  teacherKeys.forEach(key=> {
    if (renamedOldKeys.has(key)||renamedNewKeys.has(key)) return;
    const before=(current.teacherDB||{})[key];
    const after=(next.teacherDB||{})[key];
    if (!before && after) teacherItems.push(`新增 ${formatClassRef(key,next)}`);
    else if (before && !after) teacherItems.push(`移除 ${formatClassRef(key,current)}`);
    else if (before && after) {
      if ((before[0]||'')!==(after[0]||'')) teacherItems.push(`${key} 科目：${formatDiffValue(before[0])} -> ${formatDiffValue(after[0])}`);
      if ((before[1]||'')!==(after[1]||'')) teacherItems.push(`${key} 老師：${formatDiffValue(before[1])} -> ${formatDiffValue(after[1])}`);
    }
  });
  pushDiff(lines,'課程與老師',teacherItems);

  const locationItems=[];
  confirmedRenames.forEach(change=> {
    const before=(current.locationDB||{})[change.oldKey]||'';
    const after=(next.locationDB||{})[change.newKey]||'';
    if (before!==after) locationItems.push(`${formatClassRef(change.newKey,next)} 地點：${formatDiffValue(before)} -> ${formatDiffValue(after)}`)
  });
  const locationKeys=[...new Set(Object.keys(current.locationDB||{}).concat(Object.keys(next.locationDB||{})))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
  locationKeys.forEach(key=> {
    if (renamedOldKeys.has(key)||renamedNewKeys.has(key)) return;
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
      if (isRenameScheduleChange(before,after)) continue;
      if (before!==after) scheduleItems.push(`${dayDiffLabel(day)}第 ${i+1} 節：${formatClassRef(before,current)} -> ${formatClassRef(after,next)}`)
    }
  });
  pushDiff(lines,'課表內容',scheduleItems);

  const currentCountdownEvents=getCountdownEvents(current);
  const nextCountdownEvents=getCountdownEvents(next);
  const countdownItems=[];
  const eventText=event=>`${event.name} (${event.date})`;
  const matchedCurrent=new Set();
  nextCountdownEvents.forEach(event=>{
    const exact=currentCountdownEvents.findIndex((item,index)=>
      !matchedCurrent.has(index)&&item.name===event.name&&item.date===event.date);
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
    (matchedKey?mergedActions:addedActions).push(matchedKey?`合併課程「${targetKey}」（縮寫或名稱相同，使用匯入縮寫與名稱）`:`新增課程「${targetKey}」`)
  });
  merged.locationDB={...(current.locationDB||{})};
  Object.entries(imported.locationDB||{}).forEach(([importedKey,value])=> {
    const targetKey=teacherKeyMap[importedKey]||importedKey;
    const oldKey=Object.keys(currentTeacherKeyMap).find(key=>currentTeacherKeyMap[key]===targetKey);
    if (oldKey&&oldKey!==targetKey) delete merged.locationDB[oldKey];
    const currentValue=current.locationDB?.[targetKey]||current.locationDB?.[oldKey]||'';
    if (currentValue!==value) replacedActions.push(`取代課程「${targetKey}」地點：${currentValue||'（空白）'} -> ${value||'（空白）'}`);
    merged.locationDB[targetKey]=value
  });
  merged.weeklySchedule={};
  [0,1,2,3,4,5,6].forEach(day=> {
    const currentRow=current.weeklySchedule?.[day]||[], importedRow=imported.weeklySchedule?.[day]||[];
    const total=Math.max(currentRow.length,importedRow.length);
    merged.weeklySchedule[day]=Array.from({length:total},(_,index)=> {
      const currentKey=currentTeacherKeyMap[currentRow[index]]||currentRow[index]||'', importedKey=teacherKeyMap[importedRow[index]]||importedRow[index]||'';
      if (currentKey&&importedKey&&currentKey!==importedKey) replacedActions.push(`取代${dayDiffLabel(day)}第 ${index+1} 節：${currentKey} -> ${importedKey}`);
      else if (!currentKey&&importedKey) addedActions.push(`新增${dayDiffLabel(day)}第 ${index+1} 節：${importedKey}`);
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
    if (!currentEvent) addedActions.push(`新增倒數活動：${item.name}（${item.date}）`);
    else if (currentEvent.date===item.date) mergedActions.push(`合併倒數活動：${item.name}（${item.date}）`);
    else replacedActions.push(`取代倒數活動：${item.name}（${currentEvent.date} -> ${item.date}）`);
    events.set(item.name,item)
  });
  merged.countdownEvents=[...events.values()];
  if (current.reverseWeek!==imported.reverseWeek) replacedActions.push(`取代單雙週設定：${imported.reverseWeek?'開啟':'關閉'}`);
  merged.reverseWeek=imported.reverseWeek;
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
  const diff=isMerge?['新增：',...result.addedActions.map(item=>`- ${item}`),'','合併：',...result.mergedActions.map(item=>`- ${item}`),'','取代：',...result.replacedActions.map(item=>`- ${item}`)].join('\n'):describeSettingsDiff(current,next,[],{isImport:true});
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
