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
  },{passive:true})
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

