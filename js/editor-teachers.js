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

// Creates one editable teacher row.
function makeTeacherCard(key, subject, teacher, location) {
  const div = document.createElement('div');
  div.className = 'teacher-card';
  div.dataset.origKey = key;
  // syncKey tracks whatever value has already been mirrored into the schedule
  // dropdowns; origKey stays fixed to the last actually-saved key and is what
  // the changelog is built from. Keeping these separate is what prevents an
  // in-progress (not yet saved) rename from being mistaken for the baseline.
  div.dataset.syncKey = key;
  div.innerHTML = `<div class="teacher-key">${esc(key || '?')}</div><div class="teacher-fields"><input class="editor-input tc-key" placeholder="縮寫" value="${esc(key)}" maxlength="4"><input class="editor-input tc-subject" placeholder="科目" value="${esc(subject)}"><input class="editor-input tc-teacher" placeholder="教師" value="${esc(teacher)}"><input class="editor-input tc-location" placeholder="教室(選填)" value="${esc(location || '')}"></div><div class="teacher-order-actions"><span class="teacher-drag-handle" role="button" tabindex="0" title="拖曳排序" aria-label="拖曳排序">☰</span><label class="order-position-label">順序<input class="order-position" type="number" min="1" inputmode="numeric" aria-label="科目教師順序"></label><button type="button" class="teacher-assign" onclick="assignTeacherFromMenu(this)" aria-label="指定課節">排課</button><button type="button" class="delete-btn" onclick="deleteTeacherCard(this)" aria-label="刪除">×</button></div>`;
  const positionInput=div.querySelector('.order-position');
  positionInput.addEventListener('change',event=>moveEditorRowToPosition(div,event.target.value,'#teacher-list .teacher-card'));
  positionInput.addEventListener('keydown',event=>{
    if (event.key==='Enter') {
      event.preventDefault();
      moveEditorRowToPosition(div,event.target.value,'#teacher-list .teacher-card');
      positionInput.blur();
    }
  });
  const handle=div.querySelector('.teacher-drag-handle');
  handle.style.touchAction='none';
  let pointerDragging=false;
  let lastY=0;
  let scrollFrame=0;
  const movePointerDrag=event=>{
    if (!pointerDragging) return;
    lastY=event.clientY;
    autoScrollEditorWhileDragging(handle,event.clientY);
    const cards=[...document.querySelectorAll('#teacher-list .teacher-card')].filter(card=>card!==div);
    const target=cards.find(card=>event.clientY<card.getBoundingClientRect().top+card.offsetHeight/2);
    if (target) target.parentElement.insertBefore(div,target);
    else if (cards.length) cards[cards.length-1].parentElement.appendChild(div);
    refreshTeacherMoveButtons();
    refreshPeriodSelectOptions();
  };
  const autoScroll=()=>{
    if (!pointerDragging) return;
    const scroller=getEditorScrollContainer(handle);
    const before=scroller?.scrollTop||0;
    autoScrollEditorWhileDragging(handle,lastY);
    if (scroller && scroller.scrollTop!==before) movePointerDrag({clientY:lastY});
    scrollFrame=requestAnimationFrame(autoScroll);
  };
  handle.addEventListener('pointerdown',event=>{
    if (event.button!==undefined&&event.button!==0) return;
    event.preventDefault(); pointerDragging=true; lastY=event.clientY; div.classList.add('is-dragging');
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove',movePointerDrag);
    window.addEventListener('pointerup',finishPointerDrag);
    window.addEventListener('pointercancel',finishPointerDrag);
    window.addEventListener('blur',finishPointerDrag);
    scrollFrame=requestAnimationFrame(autoScroll);
  });
  const finishPointerDrag=event=>{
    if (!pointerDragging) return;
    pointerDragging=false; div.classList.remove('is-dragging');
    window.removeEventListener('pointermove',movePointerDrag);
    window.removeEventListener('pointerup',finishPointerDrag);
    window.removeEventListener('pointercancel',finishPointerDrag);
    window.removeEventListener('blur',finishPointerDrag);
    cancelAnimationFrame(scrollFrame);
    if (event?.pointerId!==undefined && handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    refreshTeacherMoveButtons(); refreshPeriodSelectOptions();
  };
  handle.addEventListener('pointerup',finishPointerDrag);
  handle.addEventListener('pointercancel',finishPointerDrag);

  div.querySelector('.tc-key').addEventListener('input', function() {
    if (this.value.length>4) this.value=this.value.slice(0,4);
    div.querySelector('.teacher-key').textContent = this.value.trim() || '?';
    refreshPeriodSelectOptions()
  });

  return div
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
  subtitle.textContent=`選擇「${key}」要放置的星期與節次`;
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
      const box=document.createElement('button'); box.type='button'; box.dataset.slot=slot;
      box.className='assign-box'+(value?' occupied':'')+(value===assignmentDraft.key?' assigned':'');
      box.textContent=`${period+1} · ${value||'—'}`; box.title=value?`第 ${period+1} 節目前是：${value}`:`第 ${period+1} 節（空白）`;
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
      setEditorConfirmContent('覆蓋這個時段？',`第 ${period+1} 節目前是「${current}」，確定改成「${key}」嗎？`,'','確定覆蓋',confirmAssignment,'返回');
      showEditorConfirmSheet();
      return;
    }
    assignmentDraft.draft.set(slot,key);
  }
  if (box) {
    const value=assignmentDraft.draft.get(slot)||'';
    box.textContent=`${period+1} · ${value||'—'}`;
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
  const key=(card?.querySelector('.tc-key')?.value||'').trim();
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
  document.getElementById('teacher-list').appendChild(makeTeacherCard('', '', ''));
  refreshPeriodSelectOptions()
}

function getTeacherDeleteKey(card) {
  return (card.querySelector('.tc-key')?.value||card.dataset.origKey||'').trim()
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
function getTeacherRenameChanges() {
  const changes=[];
  const usedNewKeys=new Set();
  document.querySelectorAll('#teacher-list .teacher-card').forEach(card=> {
    const oldKey=(card.dataset.origKey||'').trim();
    const newKey=(card.querySelector('.tc-key')?.value||'').trim();
    if (!oldKey||!newKey||oldKey===newKey||usedNewKeys.has(newKey)) return;
    usedNewKeys.add(newKey);
    changes.push({oldKey,newKey})
  });
  return changes
}
// Same shape as getTeacherRenameChanges, but measured against syncKey (the
// key already mirrored into the schedule dropdowns) instead of origKey (the
// last saved key). Used only to keep the schedule preview valid while the
// user is still editing, never for the changelog text.
function getTeacherSyncChanges() {
  const changes=[];
  const usedNewKeys=new Set();
  document.querySelectorAll('#teacher-list .teacher-card').forEach(card=> {
    const oldKey=(card.dataset.syncKey||'').trim();
    const newKey=(card.querySelector('.tc-key')?.value||'').trim();
    if (!oldKey||!newKey||oldKey===newKey||usedNewKeys.has(newKey)) return;
    usedNewKeys.add(newKey);
    changes.push({oldKey,newKey})
  });
  return changes
}
function getTeacherRenameImpacts(changes,data) {
  const impacts=[];
  const seen=new Set();
  const displayData=cloneSettingsData(data);
  const baseline=editorBaselineData||normalizeSettingsData(applicationData);
  changes.forEach(change=> {
    if (!displayData.teacherDB[change.oldKey]&&(baseline.teacherDB||{})[change.oldKey]) displayData.teacherDB[change.oldKey]=baseline.teacherDB[change.oldKey];
    if (!displayData.locationDB[change.oldKey]&&(baseline.locationDB||{})[change.oldKey]) displayData.locationDB[change.oldKey]=baseline.locationDB[change.oldKey]
  });
  function addImpact(day,index,change) {
    const id=`${day}-${index}-${change.oldKey}-${change.newKey}`;
    if (seen.has(id)) return;
    seen.add(id);
    impacts.push(`${dayDiffLabel(day)}第 ${index+1} 節：${change.oldKey} -> ${change.newKey}`)
  }
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow=> {
    const day=parseInt(dayRow.dataset.day,10);
    dayRow.querySelectorAll('.period-select').forEach((select,index)=> {
      const change=changes.find(item=>item.oldKey===select.value);
      if (change) addImpact(day,index,change)
    })
  });
  Object.entries((baseline&&baseline.weeklySchedule)||{}).forEach(([day,row])=> {
    (row||[]).forEach((key,index)=> {
      const change=changes.find(item=>item.oldKey===key);
      if (change) addImpact(parseInt(day,10),index,change)
    })
  });
  return impacts
}
function applyTeacherRenameChangesToData(data,changes) {
  changes.forEach(change=> {
    Object.keys(data.weeklySchedule||{}).forEach(day=> {
      data.weeklySchedule[day]=(data.weeklySchedule[day]||[]).map(key=>key===change.oldKey?change.newKey:key)
    })
  });
  return data
}
function getPendingTeacherRenameUpdate() {
  sortEditorPeriodsByTime();
  const changes=getTeacherSyncChanges();
  const next=normalizeSettingsData(applyTeacherRenameChangesToData(collectEditorFormState(),changes));
  const impacts=getTeacherRenameImpacts(changes,next);
  return impacts.length?{next,changes,impacts}:null
}
function getPendingTeacherRenameSaveUpdate(next) {
  const changes=getTeacherRenameChanges();
  if (!changes.length) return null;
  const syncChanges=getTeacherSyncChanges();
  const impacts=getTeacherRenameImpacts(changes,next);
  return {next,changes,syncChanges,impacts}
}
function buildTeacherRenameSaveData(pendingRename) {
  if (!pendingRename) return normalizeSettingsData(collectEditorFormState());
  // The live schedule dropdowns may still hold an intermediate synced key
  // (e.g. "B" from a rename that was previewed but never saved), not the
  // true original key, so the actual data patch must key off syncChanges.
  const patchChanges=(pendingRename.syncChanges&&pendingRename.syncChanges.length)?pendingRename.syncChanges:pendingRename.changes;
  return applyTeacherRenameChangesToData(pendingRename.next,patchChanges)
}
function buildCombinedSaveDiff(baseline,next,pendingRename) {
  const parts=[];
  if (pendingRename&&pendingRename.impacts.length) {
    parts.push(['課表改用新縮寫:'].concat(pendingRename.impacts.map(item=>`- ${item}`)).join('\n'))
  }
  const diff=describeSettingsDiff(baseline,next,pendingRename?pendingRename.changes:[]);
  if (diff) parts.push(diff);
  return parts.join('\n\n')
}
function applyTeacherRenameChangesToEditor(changes) {
  document.querySelectorAll('#schedule-grid .schedule-day-row').forEach(dayRow=> {
    dayRow.querySelectorAll('.period-select').forEach(select=> {
      const change=changes.find(item=>item.oldKey===select.value);
      if (change) select.value=change.newKey;
    })
  });

  document.querySelectorAll('#teacher-list .teacher-card').forEach(card=> {
    const keyInput=card.querySelector('.tc-key');
    if (!keyInput) return;

    const change=changes.find(item=>item.newKey===keyInput.value.trim());
    if (change) {
      card.dataset.syncKey=change.newKey;
    }
  });

  refreshPeriodSelectOptions();
}
function applyTeacherRenameBackToSchedule() {
  if (!pendingTeacherRenameSave) {
    hideEditorDiscardConfirm();
    return
  }
  applyTeacherRenameChangesToEditor(pendingTeacherRenameSave.changes);
  pendingTeacherRenameSave=null;
  hideEditorDiscardConfirm();
  openEditorFold('editor-fold-schedule',true)
}
function showTeacherRenameBackConfirm() {
  const pending=getPendingTeacherRenameUpdate();
  if (!pending) return false;

  pendingTeacherRenameSave=pending;
  applyTeacherRenameBackToSchedule();

  return true;
}
function applyTeacherCardDelete(btn) {
  const card=btn.closest('.teacher-card');
  const keys=new Set([(card?.dataset.origKey||'').trim(),(card?.querySelector('.tc-key')?.value||'').trim()]);
  card?.remove();
  document.querySelectorAll('#schedule-grid .period-select').forEach(select=>{
    if (keys.has(select.value)) select.value='';
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
  const impacts=key?getTeacherDeleteImpacts(key):[];
  if (impacts.length) {
    pendingTeacherDelete={btn,key};
    setEditorConfirmContent(
      `刪除「${key}」？`,
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

