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
  btn.textContent=open?'×':'◈';
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
  if (dateLabel) dateLabel.textContent=event.date.replaceAll('-','.');
  const [year,month,day]=event.date.split('-').map(Number);
  const examStart = new Date(year,month-1,day);
  const now = new Date();
  const diffDays = Math.ceil((examStart - now) / 86400000);

  if (diffDays > 0) {
    el.textContent = `${diffDays} 天`;
    card.setAttribute('aria-label', `${event.name}倒數 ${diffDays} 天`);
  } else if (diffDays === 0) {
    el.textContent = '今天';
    card.setAttribute('aria-label', `${event.name}今天開始`);
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

function keepActiveClassVisible(list,isDayFinished,scrollKey) {
  if (scrollKey===lastAutoScrollKey) return;
  lastAutoScrollKey=scrollKey;

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

  requestAnimationFrame(() => {
    const align = () => {
      // Use layout coordinates, not transformed client rects from the row
      // entrance animation. Recalculate after layout settles on mobile.
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
    };
    align();
    requestAnimationFrame(() => {
      requestAnimationFrame(align);
    });
    window.setTimeout(align,180);
    window.setTimeout(align,500);
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
function clampManualListScroll() {
  if (allowProgrammaticListScroll)return;
  const list=document.getElementById('schedule-list');
  if (!list)return;
  const aligned=parseFloat(list.dataset.autoAlignedTop||'');
  const max=Math.max(getNaturalListMaxScroll(list),Number.isFinite(aligned)?aligned:0);

  if (list.scrollTop>max) {
    list.scrollTop=max
  }
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
