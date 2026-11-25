(() => {
  const cfg = window.SCHOOL_CALENDAR_CONFIG || {};
  const client = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const $ = id => document.getElementById(id);
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  const seasonNames = ['겨울의 시작','새 학기의 봄','꽃 피는 봄','초록의 봄','초여름','여름의 문턱','한여름','여름의 끝','가을의 시작','깊어지는 가을','겨울의 문턱','한 해의 끝'];
  let month = 0, selected = '2026-01-02', events = [], session = null, role = null, editingId = null;
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
    $('monthNumber').textContent = String(month+1).padStart(2,'0'); $('monthLabel').textContent = `${month+1}월 달력`;
    $('monthKicker').textContent = `2026 · ${seasonNames[month]}`;
    const winter=[0,11].includes(month), spring=[2,3,4].includes(month), summer=[5,6,7].includes(month);
    const palette=winter?['#e7edf0','#b8cbd1','#f9fbfa']:spring?['#f1e7d9','#b8c9a3','#d99483']:summer?['#e8e8cd','#97b38a','#d5ae66']:['#eee4d3','#a1af85','#c47b52'];
    const leaves = winter ? '<path d="M56 130 83 97m-20 47 31-20m-11 40 24-29m-4 38 34-34m-19 43 31-32" stroke="#728b8d" stroke-width="2"/><circle cx="80" cy="96" r="3" fill="#f8faf8"/><circle cx="94" cy="122" r="3" fill="#f8faf8"/><circle cx="127" cy="136" r="3" fill="#f8faf8"/>' : spring ? '<circle cx="73" cy="109" r="5" fill="#dfa590"/><circle cx="92" cy="88" r="5" fill="#e8c58c"/><circle cx="115" cy="119" r="5" fill="#d68d83"/><circle cx="139" cy="104" r="4" fill="#e3bb79"/><circle cx="158" cy="132" r="5" fill="#d68d83"/>' : summer ? '<circle cx="68" cy="105" r="9" fill="#e6bd69"/><circle cx="100" cy="83" r="9" fill="#769573"/><circle cx="133" cy="111" r="10" fill="#e7c16d"/><circle cx="165" cy="96" r="9" fill="#729270"/>' : '<path d="M64 115q12-18 22 0m3-18q12-18 22 0m4 29q12-18 22 0m7-30q12-18 22 0m0 37q12-18 22 0" fill="none" stroke="#bd7960" stroke-width="4" stroke-linecap="round"/>';
    $('seasonArt').innerHTML=`<svg viewBox="0 0 300 220" width="300" height="220" xmlns="http://www.w3.org/2000/svg"><ellipse cx="163" cy="111" rx="111" ry="83" fill="${palette[0]}"/><circle cx="224" cy="70" r="19" fill="${palette[2]}" opacity=".8"/><path d="M38 160q58-51 111-5t115-6v57H38Z" fill="${palette[1]}"/><path d="M30 181q62-31 119 0t123-3v27H30Z" fill="#d6d8c5" opacity=".7"/><path d="M84 166V104m0 27 25-27m-25 42-20-19m71 47V91m0 33 23-28m-23 49-22-21m67 44v-55m0 22 18-18" fill="none" stroke="#657965" stroke-width="3" stroke-linecap="round"/>${leaves}<path d="M40 53q13-14 27 0m163 91q11-12 22 0" fill="none" stroke="#89968b" stroke-width="2" stroke-linecap="round"/><path d="M48 202q50-8 94 0t112-1" fill="none" stroke="#aab39d" stroke-width="1.5"/></svg>`;
    $('calendarGrid').innerHTML = '';
    const first = new Date(2026,month,1), days = new Date(2026,month+1,0).getDate();
    for (let i=0;i<first.getDay();i++) { const blank=document.createElement('div'); blank.className='day empty'; blank.setAttribute('aria-hidden','true'); $('calendarGrid').append(blank); }
    for(let n=1;n<=days;n++) {
      const date=new Date(2026,month,n), iso=dateISO(date), dayEvents=events.filter(e=>isWithin(e,iso));
      const cell=document.createElement('button'); cell.type='button'; cell.className=`day${date.getDay()===0?' sunday':''}${date.getDay()===6?' saturday':''}${iso===selected?' selected':''}${dayEvents.length?' has-event':''}`;
      cell.setAttribute('aria-label',`${month+1}월 ${n}일${dayEvents.length?`, 일정 ${dayEvents.length}개`:''}`);
      cell.innerHTML=`<span class="day-num">${n}</span>${dayEvents.map(e=>`<span class="event-chip ${escapeHTML(e.category)}">${escapeHTML(e.title)}</span>`).join('')}`;
      cell.addEventListener('click',()=>{selected=iso;render();}); $('calendarGrid').append(cell);
    }
    renderAgenda();
  }
  function renderAgenda() {
    const dt=new Date(`${selected}T00:00:00`); $('agendaHeading').textContent=`${dt.getMonth()+1}월 일정`;
    $('agendaDate').textContent=`${dt.getMonth()+1}월 ${dt.getDate()}일 · ${['일','월','화','수','목','금','토'][dt.getDay()]}요일`;
    const found=events.filter(e=>isWithin(e,selected));
    $('agendaList').innerHTML=found.length ? found.map(e=>`<article class="agenda-item"><span class="agenda-marker ${escapeHTML(e.category)}"></span><div><span class="agenda-range">${e.start===e.end?e.start.slice(5).replace('-','.'):`${e.start.slice(5).replace('-','.')} — ${e.end.slice(5).replace('-','.')}`}</span><h4>${escapeHTML(e.title)}</h4></div><span class="category-label">${{exam:'시험',school:'학교 일정',holiday:'휴일·방학'}[e.category]||'학교 일정'}</span></article>`).join('') : '<div class="empty-agenda">등록된 일정이 없는 날입니다.</div>';
  }
  function setMonth(next) { month=Math.max(0,Math.min(11,next)); selected=`2026-${String(month+1).padStart(2,'0')}-01`; render(); }
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
