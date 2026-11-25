(() => {
  const cfg = window.SCHOOL_CALENDAR_CONFIG || {};
  const client = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const $ = id => document.getElementById(id);
  const seasonNames = ['겨울의 시작','새 학기의 봄','꽃 피는 봄','초록의 봄','초여름','여름의 문턱','한여름','여름의 끝','가을의 시작','깊어지는 가을','겨울의 문턱','한 해의 끝'];
  let month = 0, selected = '2026-01-02', events = [], session = null, role = null, editingId = null;
  $('monthSelect').innerHTML = Array.from({length:12},(_,i)=>`<option value="${i}">${i+1}월</option>`).join('');
  const dateISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const isWithin = (e, iso) => e.start <= iso && iso <= e.end;
  const monthEvents = () => events.filter(e => Number(e.start.slice(5,7)) === month+1 || Number(e.end.slice(5,7)) === month+1);
  const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function loadEvents() {
    events = JSON.parse($('initialEvents').textContent);
    if (client) {
      const { data, error } = await client.from('school_events').select('id,start_date,end_date,title,category').order('start_date');
      if (!error && data?.length) events = data.map(e => ({id:e.id,start:e.start_date,end:e.end_date,title:e.title,category:e.category}));
    }
    $('eventCount').textContent = `${events.length}개 일정`;
  }
  function render() {
    $('monthNumber').textContent = String(month+1).padStart(2,'0'); $('monthSelect').value = String(month);
    $('monthKicker').textContent = `2026학년도 · ${seasonNames[month]}`;
    $('calendarGrid').setAttribute('aria-label',`2026년 ${month+1}월 학사 일정`);
    $('prevMonth').disabled = month === 0; $('nextMonth').disabled = month === 11;
    const season = [0,11].includes(month) ? 'winter' : [2,3,4].includes(month) ? 'spring' : [5,6,7].includes(month) ? 'summer' : 'autumn';
    const drawings = {
      winter: ['#e7edeb','#607e83','<path d="M65 159q43-27 80-67m-56 47-7-36m25 22 1-39m-17 76 36-8m-22-36 28-4"/><path d="m206 88 0 20m-9-10h18m-15-7 12 14m0-14-12 14"/><path d="M96 61v10m-5-5h10m-8-4 6 8m0-8-6 8"/>'],
      spring: ['#f1e8dc','#9b6a58','<path d="M78 168q19-40 49-72m-30 43-22-4m35-16 2-25m-4 33 26-5m-1 43q22-37 52-58m-26 29-19-4m34-11 2-23"/><path d="M122 87q-9-8 0-16 8 7 0 16Zm0-17q-8-8 0-16 8 8 0 16Zm-10 7q-9-8-16 0 7 9 16 0Zm20 0q9-8 16 0-7 9-16 0Z"/><circle cx="122" cy="77" r="3"/><path d="M181 105q-8-7 0-14 7 7 0 14Zm0-15q-7-7 0-14 7 7 0 14Zm-9 7q-7-7-14 0 7 7 14 0Zm18 0q7-7 14 0-7 7-14 0Z"/><circle cx="181" cy="98" r="3"/>'],
      summer: ['#edead8','#5c7658','<path d="M71 169q42-39 71-94m-42 55q-34-5-37-32 25-4 41 21m8-17q-1-34 24-47 13 26-9 49m5 31q-2-38 27-54 11 30-13 55m-3-31q27-9 45 8-15 20-38 11"/><path d="M208 79v20m-10-10h20m-17-7 14 14m0-14-14 14"/><path d="M230 123q11-11 22 0m-11-11v23"/>'],
      autumn: ['#eee3d6','#a35d46','<path d="M74 167q42-36 91-86m-63 60q-31 1-39-23 25-10 44 8m17-24q-3-28 20-41 16 24-6 45m10 3q25-13 44 1-12 22-38 16"/><path d="M186 68q-2-19 14-28 13 16-2 31m17 47q11-12 23-2-5 15-19 12m-77-69q-12-10-6-24 16 5 13 20"/><path d="M56 184q56-9 110 0t82-1"/>']
    };
    const [wash,ink,drawing] = drawings[season];
    $('seasonArt').innerHTML=`<svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M39 183q16-77 99-106 79-27 134 26 31 30 0 80-52 24-135 8-63 12-98-8Z" fill="${wash}"/><path d="M47 183q49-9 98 1t119-1" fill="none" stroke="#b9b6a8" stroke-width="1.5"/><g fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>`;
    $('calendarGrid').innerHTML = '';
    const first = new Date(2026,month,1), days = new Date(2026,month+1,0).getDate();
    for (let i=0;i<first.getDay();i++) { const blank=document.createElement('div'); blank.className='day empty'; blank.setAttribute('aria-hidden','true'); $('calendarGrid').append(blank); }
    for(let n=1;n<=days;n++) {
      const date=new Date(2026,month,n), iso=dateISO(date), dayEvents=events.filter(e=>isWithin(e,iso));
      const cell=document.createElement('button'); cell.type='button'; cell.className=`day${date.getDay()===0?' sunday':''}${date.getDay()===6?' saturday':''}${iso===selected?' selected':''}${dayEvents.length?' has-event':''}`;
      cell.dataset.date=iso; cell.setAttribute('role','gridcell'); cell.setAttribute('aria-selected',String(iso===selected));
      cell.setAttribute('aria-label',`${month+1}월 ${n}일${dayEvents.length?`, 일정 ${dayEvents.length}개`:''}`);
      cell.innerHTML=`<span class="day-num">${n}</span>${dayEvents.map(e=>`<span class="event-chip ${escapeHTML(e.category)}">${escapeHTML(e.title)}</span>`).join('')}`;
      cell.addEventListener('click',()=>{selected=iso;render();$('calendarGrid').querySelector(`[data-date="${selected}"]`)?.focus({preventScroll:true});}); $('calendarGrid').append(cell);
    }
    renderAgenda();
  }
  function renderAgenda() {
    const dt=new Date(`${selected}T00:00:00`); $('agendaHeading').textContent=`${dt.getMonth()+1}월 일정`;
    $('agendaDate').textContent=`${dt.getMonth()+1}월 ${dt.getDate()}일 · ${['일','월','화','수','목','금','토'][dt.getDay()]}요일`;
    const found=events.filter(e=>isWithin(e,selected));
    $('agendaList').innerHTML=found.length ? found.map(e=>`<article class="agenda-item"><span class="agenda-marker ${escapeHTML(e.category)}"></span><div><span class="agenda-range">${e.start===e.end?e.start.slice(5).replace('-','.'):`${e.start.slice(5).replace('-','.')} — ${e.end.slice(5).replace('-','.')}`}</span><h4>${escapeHTML(e.title)}</h4></div><span class="category-label">${{exam:'시험',school:'학교 일정',holiday:'휴일·방학'}[e.category]||'학교 일정'}</span></article>`).join('') : '<div class="empty-agenda">등록된 일정이 없는 날입니다.</div>';
  }
  function setMonth(next) { month=Math.max(0,Math.min(11,next)); selected=`2026-${String(month+1).padStart(2,'0')}-01`; render();$('calendarGrid').querySelector(`[data-date="${selected}"]`)?.focus({preventScroll:true}); }
  function updateSession(user) {
    session=user; role=null;
    if (!user || !client) { showAuth(); return; }
    client.from('profiles').select('role').eq('id',user.id).maybeSingle().then(({data})=>{role=data?.role||null;showAuth();});
  }
  function showAuth() {
    const canEdit=!!session && ['teacher','admin'].includes(role);
    $('loginBtn').hidden=!client || !!session; $('logoutBtn').hidden=!session; $('adminBtn').hidden=!canEdit;
  }
  function openManage() {
    if(!['teacher','admin'].includes(role)) return;
    $('roleNote').textContent=`${role==='admin'?'관리자':'교사'} 권한으로 일정을 관리합니다. 저장 내용은 로그인한 교직원에게 공유됩니다.`;
    $('eventTitle').value=''; $('eventCategory').value='school'; $('eventStart').value=selected; $('eventEnd').value=selected;
    $('saveMessage').textContent=''; editingId=null; $('deleteEvent').hidden=true; renderManageList(); $('adminDialog').showModal();
  }
  function renderManageList() {
    const rows=monthEvents().sort((a,b)=>a.start.localeCompare(b.start)); $('manageCount').textContent=`${rows.length}건`;
    $('manageList').innerHTML=rows.length?rows.map((e,i)=>`<button type="button" class="manage-row" data-index="${i}"><span>${escapeHTML(e.start.slice(5).replace('-','.'))}${e.end!==e.start?`—${escapeHTML(e.end.slice(5).replace('-','.'))}`:''}</span><b>${escapeHTML(e.title)}</b><span>편집 ↗</span></button>`).join(''):'<p class="empty-agenda">이 달에는 일정이 없습니다.</p>';
    $('manageList').querySelectorAll('.manage-row').forEach((btn,i)=>btn.addEventListener('click',()=>{const e=rows[i];editingId=e.id; $('eventTitle').value=e.title;$('eventCategory').value=e.category;$('eventStart').value=e.start;$('eventEnd').value=e.end;$('deleteEvent').hidden=!e.id;$('saveMessage').textContent='선택한 일정을 수정합니다.';}));
  }
  $('prevMonth').addEventListener('click',()=>setMonth(month-1)); $('nextMonth').addEventListener('click',()=>setMonth(month+1));
  $('monthSelect').addEventListener('change',ev=>setMonth(Number(ev.target.value)));
  $('calendarGrid').addEventListener('keydown',ev=>{
    const current=ev.target.closest('[data-date]'); if(!current) return;
    const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[ev.key]; if(!offset) return;
    ev.preventDefault(); const target=new Date(`${current.dataset.date}T00:00:00`); target.setDate(target.getDate()+offset);
    if(target.getFullYear()!==2026) return;
    month=target.getMonth(); selected=dateISO(target); render(); $('calendarGrid').querySelector(`[data-date="${selected}"]`)?.focus({preventScroll:true});
  });
  $('loginBtn').addEventListener('click',()=>client&&$('loginDialog').showModal()); $('adminBtn').addEventListener('click',openManage);
  $('logoutBtn').addEventListener('click',async()=>{await client?.auth.signOut();updateSession(null);});
  $('termsBtn').addEventListener('click',()=>$('termsDialog').showModal()); $('termsInline').addEventListener('click',()=>$('termsDialog').showModal());
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $('loginForm').addEventListener('submit',async ev=>{ev.preventDefault();if(!client)return;const msg=$('loginMessage');msg.textContent='로그인 중입니다…';const {data,error}=await client.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error){msg.textContent='로그인할 수 없습니다. 계정 정보를 확인해 주세요.';return;}if(!$('termsAgree').checked){await client.auth.signOut();msg.textContent='개인정보 처리 안내 확인이 필요합니다.';return;}msg.textContent='로그인되었습니다.';updateSession(data.user);setTimeout(()=>$('loginDialog').close(),350);});
  $('eventForm').addEventListener('submit',async ev=>{ev.preventDefault();if(!client||!['teacher','admin'].includes(role))return;const start=$('eventStart').value,end=$('eventEnd').value,title=$('eventTitle').value.trim();if(start>end){$('saveMessage').textContent='종료일은 시작일보다 빠를 수 없습니다.';return;}const row={start_date:start,end_date:end,title,category:$('eventCategory').value};const result=editingId?await client.from('school_events').update(row).eq('id',editingId):await client.from('school_events').insert(row);if(result.error){$('saveMessage').textContent='저장하지 못했습니다. 권한 또는 연결 설정을 확인해 주세요.';return;}await loadEvents();render();renderManageList();editingId=null;$('saveMessage').textContent='일정을 저장했습니다.';});
  $('deleteEvent').addEventListener('click',async()=>{if(!editingId)return;const {error}=await client.from('school_events').delete().eq('id',editingId);if(error){$('saveMessage').textContent='삭제하지 못했습니다. 권한을 확인해 주세요.';return;}await loadEvents();render();renderManageList();editingId=null;$('saveMessage').textContent='일정을 삭제했습니다.';$('deleteEvent').hidden=true;});
  async function start(){await loadEvents();render();if(client){const {data:{session:current}}=await client.auth.getSession();updateSession(current?.user||null);client.auth.onAuthStateChange((_event,s)=>updateSession(s?.user||null));}else showAuth();}
  start();
})();
