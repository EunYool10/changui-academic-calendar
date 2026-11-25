(() => {
  const cfg = window.SCHOOL_CALENDAR_CONFIG || {};
  const client = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const $ = id => document.getElementById(id);
  const seasonNames = ['겨울의 시작','새 학기의 봄','꽃 피는 봄','초록의 봄','초여름','여름의 문턱','한여름','여름의 끝','가을의 시작','깊어지는 가을','겨울의 문턱','한 해의 끝'];
  const kstNow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).reduce((date, part) => ({ ...date, [part.type]: part.value }), {});
  const initialDate = Number(kstNow.year) === 2026 ? `${kstNow.year}-${kstNow.month}-${kstNow.day}` : '2026-01-02';
  let month = Number(initialDate.slice(5,7)) - 1, selected = initialDate, events = [], session = null, role = null, editingId = null;
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
    $('hero').dataset.month = String(month + 1);
    const drawings = [
      ['#dfeaf0','#4d6d7d','<path d="M53 177q50-26 97-11t96-6M78 156V77m0 40 27-27m-27 47-22-20m73 51V64m0 43 25-25m-25 47-23-21M56 70l9 9m-1-17 0 18m-8-9h18"/><circle cx="205" cy="68" r="17"/>'],
      ['#e7edf0','#647682','<path d="M58 174q64-18 111-7t84-12M106 166V74m0 40 27-32m-27 54-28-24m76 55V92m0 33 23-24m-23 42-24-18"/><path d="M210 55v26m-13-13h26M66 83q11-10 22 0m96-27q11-10 22 0"/>'],
      ['#e8eed9','#648052','<path d="M57 177q60-24 112-8t81-12M88 169q13-50 40-91m-20 48q-27-7-33-32 25-1 36 23m6-17q-2-30 20-42 13 22-9 43m8 48q17-43 48-69m-21 37q-20-5-25-25 20-1 29 17"/><path d="M210 62q10-10 20 0m-10-10v20"/>'],
      ['#f2dde0','#8d596a','<path d="M56 177q55-20 107-7t83-13M81 169q21-49 55-92m-28 50-25-7m40-20 2-28m13 88q18-43 49-67m-26 34-20-6"/><g fill="#c2748c" stroke="none"><circle cx="136" cy="77" r="8"/><circle cx="121" cy="91" r="7"/><circle cx="188" cy="95" r="8"/><circle cx="171" cy="108" r="6"/></g>'],
      ['#e1eee4','#50775b','<path d="M56 177q54-19 109-7t86-13M89 170q13-56 49-96m-25 50q-28-8-34-36 26 0 37 26m3-13q0-34 26-47 12 28-12 49m12 55q8-45 45-72m-18 39q-23-5-29-27 23-2 33 19"/><circle cx="220" cy="64" r="14"/>'],
      ['#ddebf0','#517288','<path d="M54 178q63-17 111-6t84-15M82 171q20-57 56-96m-28 50-25-7m40-19 2-29m14 92q13-43 49-73m-24 38-22-7"/><path d="M205 65c-18 16-8 34 0 45m20-49c-18 16-8 34 0 45m20-37c-13 13-7 27 0 36"/>'],
      ['#f0dfbc','#956436','<path d="M49 178q62-17 115-6t88-16M81 172q18-48 55-93m-28 52-23-5m38-22 3-29m13 87q20-46 51-73m-27 37-20-5"/><circle cx="222" cy="62" r="21"/><path d="M190 143q17-14 34 0m-17-15v30"/>'],
      ['#d9eeeb','#397b7a','<path d="M45 170q23-15 47 0t47 0 47 0 47 0 47 0"/><path d="M44 185q23-15 47 0t47 0 47 0 47 0 47 0"/><path d="M86 163q23-54 50-88m-27 49-24-7m41-21 3-29"/><circle cx="218" cy="62" r="19"/>'],
      ['#f0dfc1','#a07031','<path d="M50 178q57-18 108-6t90-15M82 171q13-48 46-94m-24 52-25-5m41-22 3-30m13 88q17-46 48-74m-24 38-23-5"/><g fill="#c48635" stroke="none"><path d="m157 78 10 12-13 6 5-14Z"/><path d="m184 102 11 11-13 8 4-15Z"/><path d="m113 98 9 12-13 5 4-14Z"/></g>'],
      ['#ead6c7','#994f3c','<path d="M47 177q55-20 109-7t92-13M78 171q19-53 55-94m-27 51-27-6m43-20 2-29m15 88q13-47 50-75m-25 39-23-7"/><path d="M207 70q9-8 18 0m-9-10v21M218 111q9-8 18 0m-9-10v21"/>'],
      ['#e4e0ec','#645a7c','<path d="M48 177q58-20 109-7t90-13M81 171q17-51 48-94m-24 53-27-7m43-20 2-29m17 88q15-46 48-76m-25 39-23-6"/><g fill="#d3a847" stroke="none"><circle cx="112" cy="100" r="8"/><circle cx="135" cy="82" r="7"/><circle cx="182" cy="99" r="8"/></g>'],
      ['#dbe5ef','#3d5872','<path d="M48 178q57-21 111-7t89-14M79 172V88m0 42 26-28m-26 48-25-20m74 42V73m0 48 28-28m-28 47-24-20"/><path d="M212 60l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z"/><path d="M175 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>']
    ];
    const [wash,ink,drawing] = drawings[month];
    const accents = ['#f7fbfc','#f4e8ca','#f8df79','#e9b4bd','#e4d785','#bcdce7','#f2c761','#b9e3da','#edc65d','#d78b5d','#d7ba60','#b9d5e5'];
    const grounds = ['#c2d0d1','#c9d4d6','#b6c99f','#d9aeb7','#aac792','#a6c9d1','#d8ac63','#78aea5','#d4ab5e','#bd7057','#a99dba','#8da9c0'];
    $('seasonArt').innerHTML=`<svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="25" y="20" width="250" height="170" rx="18" fill="${wash}"/><circle cx="218" cy="63" r="21" fill="${accents[month]}" opacity=".9"/><path d="M30 157q42-38 85-13t81-16q38-27 75 13v49H30Z" fill="${grounds[month]}" opacity=".72"/><path d="M30 174q49-15 97-2t85-5q32-7 59 7v16H30Z" fill="#f8f6ef" opacity=".85"/><path d="M43 181q53-8 106 1t111-1" fill="none" stroke="#a7aaa0" stroke-width="1.5"/><g fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>`;
    $('calendarGrid').innerHTML = '';
    const first = new Date(2026,month,1), days = new Date(2026,month+1,0).getDate();
    for (let i=0;i<first.getDay();i++) { const blank=document.createElement('div'); blank.className='day empty'; blank.setAttribute('aria-hidden','true'); $('calendarGrid').append(blank); }
    for(let n=1;n<=days;n++) {
      const date=new Date(2026,month,n), iso=dateISO(date), dayEvents=events.filter(e=>isWithin(e,iso));
      const cell=document.createElement('button'); cell.type='button'; cell.className=`day${date.getDay()===0?' sunday':''}${date.getDay()===6?' saturday':''}${iso===selected?' selected':''}${dayEvents.length?' has-event':''}`;
      cell.dataset.date=iso; cell.setAttribute('role','gridcell'); cell.setAttribute('aria-selected',String(iso===selected));
      cell.setAttribute('aria-label',`${month+1}월 ${n}일${dayEvents.length?`, 일정 ${dayEvents.length}개`:''}`);
      cell.innerHTML=`<span class="day-num">${n}</span><span class="day-events">${dayEvents.map(e=>`<span class="event-chip ${escapeHTML(e.category)}">${escapeHTML(e.title)}</span>`).join('')}</span>`;
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
