(() => {
  const cfg = window.SCHOOL_CALENDAR_CONFIG || {};
  const fb = cfg.firebase && cfg.firebase.apiKey && cfg.firebase.projectId ? cfg.firebase : null;
  const $ = id => document.getElementById(id);
  const DB = fb ? `projects/${fb.projectId}/databases/(default)/documents` : '';
  const DOCS = fb ? `https://firestore.googleapis.com/v1/${DB}` : '';
  const AUTH = 'https://identitytoolkit.googleapis.com/v1';
  const SESSION_KEY = 'changuiCalendarSession', GRADE_KEY = 'changuiCalendarGrade';
  const CATEGORY_NAMES = { exam: '시험', school: '학교 일정', holiday: '휴일·방학' };
  const seasonNames = ['겨울의 시작','새 학기의 봄','꽃 피는 봄','초록의 봄','초여름','여름의 문턱','한여름','여름의 끝','가을의 시작','깊어지는 가을','겨울의 문턱','한 해의 끝'];
  const WEEKDAYS = '일월화수목금토';

  // 한국 시간 기준 오늘. 해가 바뀌면 그 해 학사 일정을 자동으로 보여 줍니다(2027년이 되면 2027학년도).
  const kstToday = () => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).reduce((date, part) => ({ ...date, [part.type]: part.value }), {});
    return `${p.year}-${p.month}-${p.day}`;
  };
  let today = kstToday();
  const YEAR = Math.max(2026, Number(today.slice(0, 4)));
  const pad = n => String(n).padStart(2, '0');
  const dateISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const yearStart = `${YEAR}-01-01`, yearEnd = `${YEAR}-12-31`;
  let selected = today.startsWith(`${YEAR}-`) ? today : yearStart;
  let month = Number(selected.slice(5, 7)) - 1;
  let events = [], publicHolidays = [], editingId = null, session = null;
  let view = 'calendar', listYear = YEAR, booted = false;
  const CACHE_KEY = 'changuiCalendarCache', CACHE_MS = 5 * 60 * 1000; // 같은 브라우저에서는 5분 동안 다시 읽지 않습니다(무료 읽기 한도 절약)
  let lastTap = { day: '', at: 0 }; // 같은 날짜를 짧은 간격으로 두 번 누르면 편집 (마우스 더블 클릭·휴대폰 두 번 탭 공통)
  const DOUBLE_TAP_MS = 450;
  const isAdmin = () => !!session && session.role === 'admin';

  const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const categoryOf = c => (CATEGORY_NAMES[c] ? c : 'school');
  const categoryName = e => (e.isPublic ? '공휴일' : CATEGORY_NAMES[categoryOf(e.category)]);
  const shortDate = d => d.slice(5).replace('-', '.');
  const withWeekday = d => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}(${WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]})`;
  const rangeText = e => (e.start === e.end ? withWeekday(e.start) : `${withWeekday(e.start)} ~ ${withWeekday(e.end)}`);
  const isWithin = (e, day) => e.start <= day && day <= e.end;
  const overlapsYear = (e, y) => e.start <= `${y}-12-31` && e.end >= `${y}-01-01`;
  const inYear = e => overlapsYear(e, YEAR);
  const byDate = (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
  const monthRange = () => [`${YEAR}-${pad(month + 1)}-01`, dateISO(new Date(YEAR, month + 1, 0))];
  const monthEvents = () => { const [a, b] = monthRange(); return events.filter(e => e.start <= b && e.end >= a).sort(byDate); };
  const validDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && dateISO(new Date(`${s}T00:00:00`)) === s;

  /* ---------- 대상 학년: 일정명 끝의 (1학년), (1,2학년), (1~3학년)에서 읽습니다 ---------- */
  const GRADE_ONE = /\(\s*([1-3](?:\s*[,~·]\s*[1-3])*)\s*학년\s*\)/;
  const GRADE_ALL = new RegExp(`\\s*${GRADE_ONE.source}`, 'g');
  function parseGrades(title) {
    const m = GRADE_ONE.exec(String(title));
    if (!m) return [];
    const set = new Set();
    m[1].replace(/\s/g, '').split(/[,·]/).forEach(part => {
      const [a, b = a] = part.split('~').map(Number);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i);
    });
    return [...set].sort();
  }
  const withGrades = (title, list) => {
    const base = String(title).replace(GRADE_ALL, '').trim();
    return list.length ? `${base}(${list.length === 3 ? '1~3' : list.join(',')}학년)` : base;
  };
  let gradeFilter = (() => { try { const g = localStorage.getItem(GRADE_KEY) || ''; return /^[123]$/.test(g) ? g : ''; } catch { return ''; } })();
  // 학년이 적히지 않았거나 세 학년 모두인 일정은 어느 학년을 골라도 보입니다.
  const forGrade = e => !gradeFilter || !e.grades || e.grades.length === 0 || e.grades.length === 3 || e.grades.includes(Number(gradeFilter));
  const withMeta = e => ({ ...e, category: categoryOf(e.category), grades: parseGrades(e.title) });

  /* ---------- 공휴일 (holidays.js) ---------- */
  const HOLIDAYS = window.KR_HOLIDAYS || {};
  const holidayKey = name => name.replace(/^대체공휴일\((.+)\)$/, '$1').replace(/\s*연휴$/, '').replace(/\s/g, '');
  // 학교가 같은 날 같은 이름으로 직접 넣은 일정이 있으면(예: "노동절", "부처님오신날 대체휴일") 공휴일은 한 번만 보입니다.
  const holidaysFor = y => (HOLIDAYS[y] || [])
    .map(([start, end, title]) => ({ id: '', start, end, title, category: 'holiday', grades: [], isPublic: true }))
    .filter(h => !events.some(e => e.start <= h.end && e.end >= h.start && e.title.replace(/\s/g, '').includes(holidayKey(h.title))));
  const shownEvents = () => publicHolidays.concat(events.filter(forGrade).sort(byDate));

  /* ---------- 최근 바뀐 일정: 날짜를 바꾼 일정과 한 건씩 새로 넣은 일정을 7일 동안 표시합니다 ---------- */
  const RECENT_MS = 7 * 86400000;
  const isRecent = t => !!t && Date.now() - Date.parse(t) < RECENT_MS;
  const markOf = e => (e.isPublic ? '' : isRecent(e.changedAt) && e.prevStart ? 'changed' : isRecent(e.createdAt) ? 'new' : '');
  const prevText = e => rangeText({ start: e.prevStart, end: e.prevEnd || e.prevStart });
  const markTag = (e, short) => {
    const m = markOf(e);
    return m ? `<b class="mark-tag ${m}">${m === 'changed' ? (short ? '변경' : '날짜 변경') : (short ? '새' : '새 일정')}</b>` : '';
  };
  const markLine = e => {
    const m = markOf(e);
    return m === 'changed' ? `<p class="mark-line changed">날짜가 바뀌었습니다 · 원래 ${prevText(e)}</p>` : m === 'new' ? '<p class="mark-line new">새로 추가된 일정입니다</p>' : '';
  };

  function applyYear() {
    document.title = `창의경영고등학교 · ${YEAR} 학사 달력`;
    $('heroYear').textContent = String(YEAR);
    $('footerYear').textContent = `${YEAR}학년도`;
    $('monthSelect').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i + 1}월</option>`).join('');
    const nextFirst = Number(today.slice(5, 7)) >= 10; // 가을부터는 다음 해 일정을 미리 넣는 경우가 많습니다.
    $('bulkYear').innerHTML = [YEAR, YEAR + 1].map(y => `<option value="${y}"${(nextFirst ? y === YEAR + 1 : y === YEAR) ? ' selected' : ''}>${y}</option>`).join('');
    $('neisYear').textContent = $('bulkYear').value;
  }

  /* ---------- 일정 데이터 (Firestore REST) ---------- */
  const fromDoc = d => {
    const f = d.fields || {}, v = k => (f[k] && f[k].stringValue) || '', t = k => (f[k] && f[k].timestampValue) || '';
    return withMeta({ id: d.name.split('/').pop(), start: v('start'), end: v('end'), title: v('title'), category: v('category'), note: v('note'),
      updatedAt: t('updatedAt'), createdAt: t('createdAt'), changedAt: t('changedAt'), prevStart: v('prevStart'), prevEnd: v('prevEnd') });
  };
  const kstDate = t => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)).replace(/\s/g, '').replace(/\.$/, '');
  const readCache = () => {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.year === YEAR && Array.isArray(c.events) ? c : null; } catch { return null; }
  };
  const writeCache = data => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ year: YEAR, at: Date.now(), events: data.list, updatedAt: data.updatedAt })); } catch {} };
  async function fetchEvents() {
    // 올해 1월 1일 이후에 끝나는 일정만 읽습니다. 지난 해 일정이 쌓여도 읽는 양이 늘지 않습니다.
    const r = await fetch(`${DOCS}:runQuery?key=${fb.apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'events' }], where: { fieldFilter: { field: { fieldPath: 'end' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: yearStart } } } } }) });
    if (!r.ok) throw new Error(String(r.status));
    const list = (await r.json()).filter(x => x.document).map(x => fromDoc(x.document)).filter(e => e.start && e.end && e.title);
    let updatedAt = '';
    const m = await fetch(`${DOCS}/meta/site?key=${fb.apiKey}`);
    if (m.ok) { const j = await m.json(); updatedAt = (j.fields && j.fields.updatedAt && j.fields.updatedAt.timestampValue) || ''; }
    if (!updatedAt) updatedAt = list.reduce((a, e) => (e.updatedAt > a ? e.updatedAt : a), '');
    return { list, updatedAt };
  }
  async function loadEvents(fresh = false) {
    const cached = readCache();
    let data = null;
    if (!fresh && cached && Date.now() - cached.at < CACHE_MS) data = { list: cached.events, updatedAt: cached.updatedAt };
    else if (fb) {
      try { data = await fetchEvents(); writeCache(data); }
      catch { if (cached) data = { list: cached.events, updatedAt: cached.updatedAt }; } // 연결이 안 되면 마지막으로 받은 일정
    }
    events = (data ? data.list : JSON.parse($('initialEvents').textContent)).map(withMeta);
    publicHolidays = holidaysFor(YEAR);
    $('eventCount').textContent = `${events.filter(inYear).length}개 일정`;
    renderDday();
    const latest = data ? data.updatedAt : '';
    $('footerUpdated').hidden = !latest;
    if (latest) $('footerUpdated').textContent = `일정 업데이트 ${kstDate(latest)}`;
  }
  async function touchMeta() {
    try { await authedFetch(`${DOCS}/meta/site?updateMask.fieldPaths=updatedAt`, { method: 'PATCH', body: JSON.stringify({ fields: { updatedAt: { timestampValue: new Date().toISOString() } } }) }); } catch {}
  }
  const eventFields = e => {
    const f = { start: { stringValue: e.start }, end: { stringValue: e.end }, title: { stringValue: e.title },
      category: { stringValue: e.category }, updatedAt: { timestampValue: new Date().toISOString() } };
    if (e.note) f.note = { stringValue: e.note };
    ['createdAt', 'changedAt'].forEach(k => { if (e[k]) f[k] = { timestampValue: e[k] }; });
    ['prevStart', 'prevEnd'].forEach(k => { if (e[k]) f[k] = { stringValue: e[k] }; });
    return { fields: f };
  };
  // 고칠 때 updateMask에 있는데 값이 없는 칸(지운 메모, 없앤 변경 표시)은 지워집니다. createdAt은 넣지 않아 그대로 남습니다.
  const EDIT_FIELDS = ['start', 'end', 'title', 'category', 'updatedAt', 'note', 'changedAt', 'prevStart', 'prevEnd'];
  // 날짜를 바꾸면 학생들이 알아보도록 바꾼 시각과 원래 날짜를 남깁니다. 7일 안에 또 바꾸면 처음 날짜를 계속 '원래 날짜'로 둡니다.
  function changeRecord(old, e, notify) {
    const keep = { changedAt: old.changedAt || '', prevStart: old.prevStart || '', prevEnd: old.prevEnd || '' };
    if (!notify || (old.start === e.start && old.end === e.end)) return keep;
    const fresh = isRecent(old.changedAt) && old.prevStart;
    const prevStart = fresh ? old.prevStart : old.start, prevEnd = fresh ? (old.prevEnd || old.prevStart) : old.end;
    if (prevStart === e.start && prevEnd === e.end) return { changedAt: '', prevStart: '', prevEnd: '' }; // 원래 날짜로 되돌리면 표시를 없앱니다.
    return { changedAt: new Date().toISOString(), prevStart, prevEnd };
  }
  async function authedFetch(url, opts = {}) {
    const token = await idToken();
    return fetch(url, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
  }
  async function saveEvent(e, id) {
    const mask = EDIT_FIELDS.map(k => `updateMask.fieldPaths=${k}`).join('&');
    const r = id
      ? await authedFetch(`${DOCS}/events/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, { method: 'PATCH', body: JSON.stringify(eventFields(e)) })
      : await authedFetch(`${DOCS}/events`, { method: 'POST', body: JSON.stringify(eventFields(e)) });
    if (!r.ok) throw new Error(r.status === 403 ? 'PERMISSION' : 'SAVE_FAILED');
  }
  async function removeEvent(id) {
    const r = await authedFetch(`${DOCS}/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(r.status === 403 ? 'PERMISSION' : 'DELETE_FAILED');
  }
  const newId = () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; return Array.from(crypto.getRandomValues(new Uint8Array(20)), x => c[x % 62]).join(''); };
  // 여러 건은 한 번의 commit으로 저장합니다. 한 묶음 안에서는 모두 저장되거나 하나도 저장되지 않습니다.
  async function saveMany(list) {
    for (let i = 0; i < list.length; i += 400) {
      const writes = list.slice(i, i + 400).map(e => ({ update: { name: `${DB}/events/${newId()}`, ...eventFields(e) }, currentDocument: { exists: false } }));
      const r = await authedFetch(`${DOCS}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
      if (!r.ok) throw new Error(r.status === 403 ? 'PERMISSION' : 'SAVE_FAILED');
    }
  }

  /* ---------- 교직원 로그인 (Firebase Auth REST) ---------- */
  const loginEmail = id => `${id.trim().toLowerCase()}@${cfg.staffDomain || fb.authDomain}`;
  const authError = code => {
    if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(code)) return '아이디 또는 비밀번호가 맞지 않습니다.';
    if (/TOO_MANY_ATTEMPTS/.test(code)) return '로그인 시도가 많아 잠시 막혔습니다. 몇 분 뒤 다시 시도해 주세요.';
    if (/USER_DISABLED/.test(code)) return '사용이 중지된 계정입니다. 학교 관리자에게 문의해 주세요.';
    if (/WEAK_PASSWORD/.test(code)) return '새 비밀번호는 8자 이상으로 정해 주세요.';
    if (/NOT_ADMIN/.test(code)) return '일정 수정 권한이 없는 계정입니다.';
    if (/CONFIGURATION_NOT_FOUND|OPERATION_NOT_ALLOWED/.test(code)) return '로그인 기능이 아직 준비되지 않았습니다. 학교 관리자에게 알려 주세요.';
    return '로그인하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  };
  async function authPost(path, body) {
    const r = await fetch(`${AUTH}/${path}?key=${fb.apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'AUTH_FAILED');
    return j;
  }
  function keep(j, loginId) {
    session = { ...(session || {}), uid: j.localId || j.user_id || (session && session.uid), idToken: j.idToken || j.id_token, refreshToken: j.refreshToken || j.refresh_token,
      expiresAt: Date.now() + Number(j.expiresIn || j.expires_in || 3600) * 1000, loginId: loginId || (session && session.loginId) };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ uid: session.uid, refreshToken: session.refreshToken, loginId: session.loginId })); } catch {}
  }
  async function refreshToken() {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${fb.apiKey}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'TOKEN_EXPIRED');
    keep(j);
  }
  async function idToken() {
    if (!session) throw new Error('NOT_SIGNED_IN');
    if (!session.idToken || Date.now() > session.expiresAt - 60000) await refreshToken();
    return session.idToken;
  }
  async function loadRole() {
    const r = await authedFetch(`${DOCS}/staff/${encodeURIComponent(session.uid)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return (j.fields && j.fields.role && j.fields.role.stringValue) || null;
  }
  async function signIn(id, password) {
    session = null;
    keep(await authPost('accounts:signInWithPassword', { email: loginEmail(id), password, returnSecureToken: true }), id.trim().toLowerCase());
    session.role = await loadRole();
    if (session.role !== 'admin') { signOut(); throw new Error('NOT_ADMIN'); }
  }
  function signOut() {
    session = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    if ($('adminDialog').open) $('adminDialog').close();
    showAuth();
  }
  async function restoreSession() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch {}
    if (!fb || !saved || !saved.refreshToken) return;
    session = { ...saved, idToken: '', expiresAt: 0 };
    try { await refreshToken(); session.role = await loadRole(); if (session.role !== 'admin') signOut(); }
    catch { signOut(); }
  }
  function showAuth() {
    const admin = isAdmin();
    $('loginBtn').hidden = !!session;
    $('logoutBtn').hidden = !session;
    $('adminBtn').hidden = !admin;
    document.body.classList.toggle('is-admin', admin);
    showNote();
    if (view === 'list') renderYear();
  }
  function showNote() {
    $('legendNote').textContent = isAdmin() ? '날짜나 일정을 두 번 누르면 바로 추가·수정할 수 있습니다.'
      : gradeFilter ? `${gradeFilter}학년 일정과 전체 학년 일정만 보입니다.` : '날짜를 선택하면 해당 일정이 표시됩니다.';
  }

  /* ---------- 화면: 달력 ---------- */
  function render() {
    $('monthNumber').textContent = pad(month + 1);
    $('monthSelect').value = String(month);
    $('monthKicker').textContent = `${YEAR}학년도 · ${seasonNames[month]}`;
    $('calendarGrid').setAttribute('aria-label', `${YEAR}년 ${month + 1}월 학사 일정`);
    $('prevMonth').disabled = month === 0;
    $('nextMonth').disabled = month === 11;
    $('todayBtn').disabled = selected === today && today.startsWith(`${YEAR}-`);
    $('hero').dataset.month = String(month + 1);
    const grid = $('calendarGrid'), shown = shownEvents();
    grid.innerHTML = '';
    const first = new Date(YEAR, month, 1), days = new Date(YEAR, month + 1, 0).getDate();
    const blank = () => { const b = document.createElement('div'); b.className = 'day empty'; b.setAttribute('aria-hidden', 'true'); grid.append(b); };
    for (let i = 0; i < first.getDay(); i++) blank();
    for (let n = 1; n <= days; n++) {
      const date = new Date(YEAR, month, n), day = dateISO(date), dayEvents = shown.filter(e => isWithin(e, day));
      const holiday = dayEvents.find(e => e.isPublic), own = dayEvents.filter(e => !e.isPublic).length;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `day${date.getDay() === 0 ? ' sunday' : ''}${date.getDay() === 6 ? ' saturday' : ''}${holiday ? ' red-day' : ''}${day === selected ? ' selected' : ''}${day === today ? ' today' : ''}${dayEvents.length ? ' has-event' : ''}`;
      cell.dataset.date = day;
      cell.setAttribute('aria-pressed', String(day === selected));
      if (day === today) cell.setAttribute('aria-current', 'date');
      cell.setAttribute('aria-label', `${month + 1}월 ${n}일${holiday ? `, ${holiday.title}` : ''}${own ? `, 일정 ${own}개` : ''}`);
      cell.innerHTML = `<span class="day-num">${n}</span><span class="day-events">${dayEvents.map(e => `<span class="event-chip ${e.category}${e.isPublic ? ' public' : ''}" data-id="${escapeHTML(e.id || '')}">${markTag(e, true)}${escapeHTML(e.title)}</span>`).join('')}</span>`;
      cell.addEventListener('click', ev => {
        const now = Date.now(), chip = ev.target.closest('.event-chip');
        const isDouble = lastTap.day === day && now - lastTap.at < DOUBLE_TAP_MS;
        lastTap = { day, at: isDouble ? 0 : now };
        selected = day;
        if (isDouble && isAdmin()) { openEditor(day, chip ? chip.dataset.id : ''); return; }
        render(); focusSelected();
      });
      grid.append(cell);
    }
    for (let i = first.getDay() + days; i % 7; i++) blank();
    renderAgenda();
    syncHash();
  }
  const focusSelected = () => { const el = $('calendarGrid').querySelector(`[data-date="${selected}"]`); if (el) el.focus({ preventScroll: true }); };
  function renderAgenda() {
    const dt = new Date(`${selected}T00:00:00`);
    $('agendaHeading').textContent = `${dt.getMonth() + 1}월 일정`;
    $('agendaDate').textContent = `${dt.getMonth() + 1}월 ${dt.getDate()}일 · ${WEEKDAYS[dt.getDay()]}요일`;
    const found = shownEvents().filter(e => isWithin(e, selected));
    $('agendaList').innerHTML = found.length ? found.map(e => `<article class="agenda-item${e.isPublic ? ' public' : ''}"><span class="agenda-marker ${e.isPublic ? 'public' : e.category}"></span><div><span class="agenda-range">${e.start === e.end ? shortDate(e.start) : `${shortDate(e.start)} — ${shortDate(e.end)}`}</span><h4>${escapeHTML(e.title)}</h4>${markLine(e)}${e.note ? `<p class="agenda-note">${escapeHTML(e.note)}</p>` : ''}</div><span class="category-label">${categoryName(e)}</span></article>`).join('')
      : '<div class="empty-agenda">등록된 일정이 없는 날입니다.</div>';
    renderMeal();
  }

  /* ---------- 나이스 교육정보 개방 포털: 인증키 없이 쓰므로 한 번에 5건까지만 옵니다 ---------- */
  const neis = cfg.neis && cfg.neis.office && cfg.neis.school ? cfg.neis : null;
  async function neisGet(svc, params) {
    const u = new URL(`https://open.neis.go.kr/hub/${svc}`);
    Object.entries({ Type: 'json', pSize: 1000, ATPT_OFCDC_SC_CODE: neis.office, SD_SCHUL_CODE: neis.school, ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u);
    if (!r.ok) throw new Error(`NEIS_${r.status}`);
    const j = await r.json();
    if (j[svc]) return { total: Number(j[svc][0].head[0].list_total_count) || 0, rows: (j[svc][1] && j[svc][1].row) || [] };
    if (j.RESULT && j.RESULT.CODE === 'INFO-200') return { total: 0, rows: [] }; // 해당하는 데이터가 없습니다
    throw new Error((j.RESULT && j.RESULT.CODE) || 'NEIS');
  }

  /* ---------- 급식: 고른 날짜 하루치를 받아 일정 아래에 보여 줍니다 ---------- */
  const mealCache = new Map();
  let mealDay = '', mealTimer = 0;
  const unescapeHTML = x => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const DISH_RE = /^(.*?)\s*\(([\d.\s]+)\)\s*$/; // "어묵우동국 (1.5.6.7.18)" → 이름 + 알레르기 번호
  const dishList = text => String(text || '').split(/<br\s*\/?>/i).map(x => unescapeHTML(x).trim()).filter(Boolean)
    .map(x => { const m = DISH_RE.exec(x); return m ? { name: m[1], allergy: m[2].replace(/\s/g, '').replace(/^\.+|\.+$/g, '') } : { name: x, allergy: '' }; });
  function showMeal(rows) {
    const body = $('mealBody');
    if (!rows.length) { body.innerHTML = '<p class="meal-empty">등록된 급식이 없습니다.</p>'; return; }
    $('mealKcal').textContent = rows.length === 1 && rows[0].CAL_INFO ? rows[0].CAL_INFO.replace(/\s*kcal/i, ' kcal') : '';
    body.innerHTML = rows.map(r => `${rows.length > 1 ? `<p class="meal-kind">${escapeHTML(r.MMEAL_SC_NM || '')}<span>${escapeHTML((r.CAL_INFO || '').replace(/\s*kcal/i, ' kcal'))}</span></p>` : ''}`
      + `<ul class="meal-list">${dishList(r.DDISH_NM).map(d => `<li>${escapeHTML(d.name)}${d.allergy ? ` <small>${escapeHTML(d.allergy)}</small>` : ''}</li>`).join('')}</ul>`).join('');
  }
  function renderMeal() {
    if (!neis) { $('mealBox').hidden = true; return; }
    const day = selected, dt = new Date(`${day}T00:00:00`);
    $('mealHeading').textContent = day === today ? '오늘의 급식' : `${dt.getMonth() + 1}월 ${dt.getDate()}일 급식`;
    if (day === mealDay) return;
    mealDay = day; clearTimeout(mealTimer); $('mealKcal').textContent = '';
    const body = $('mealBody');
    if (dt.getDay() === 0 || dt.getDay() === 6 || publicHolidays.some(h => isWithin(h, day))) { body.innerHTML = '<p class="meal-empty">급식이 없는 날입니다.</p>'; return; }
    if (mealCache.has(day)) { showMeal(mealCache.get(day)); return; }
    body.innerHTML = '<p class="meal-empty">급식을 불러오는 중…</p>';
    // 화살표 키로 날짜를 빠르게 넘길 때는 멈춘 날짜만 받습니다.
    mealTimer = setTimeout(() => neisGet('mealServiceDietInfo', { MLSV_YMD: day.replace(/-/g, '') })
      .then(r => { mealCache.set(day, r.rows); if (mealDay === day) showMeal(r.rows); })
      .catch(() => {
        if (mealDay !== day) return;
        mealDay = '';
        body.innerHTML = '<p class="meal-empty">급식 정보를 불러오지 못했습니다. <button type="button" class="text-button" data-meal-retry>다시 시도</button></p>';
      }), 200);
  }

  /* ---------- 나이스 학사일정 불러오기 (관리자) ---------- */
  async function neisSchedule(y, progress) {
    const DAY = 86400000, ymd = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
    const rows = [];
    let calls = 0;
    async function grab(a, b) { // 5건이 넘는 기간은 반으로 나눠 다시 받습니다.
      const r = await neisGet('SchoolSchedule', { AA_FROM_YMD: ymd(a), AA_TO_YMD: ymd(b) });
      progress(++calls);
      if (r.rows.length >= r.total || a === b) { rows.push(...r.rows); return; }
      const mid = a + Math.floor((b - a) / DAY / 2) * DAY;
      await grab(a, mid); await grab(mid + DAY, b);
    }
    const months = Array.from({ length: 12 }, (_, m) => [Date.UTC(y, m, 1), Date.UTC(y, m + 1, 0)]);
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => { while (next < months.length) { const [a, b] = months[next++]; await grab(a, b); } }));
    return rows;
  }
  // 나이스는 하루에 한 줄씩 주므로 같은 일정이 날짜가 이어지면 기간 하나로 묶고, 붙여넣기 칸에 넣을 줄로 바꿉니다.
  function neisLines(rows) {
    const addDay = d => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
    const items = rows.filter(r => r.EVENT_NM && r.SBTR_DD_SC_NM !== '공휴일' && !/토요휴업일/.test(r.EVENT_NM)).map(r => {
      const name = r.EVENT_NM.trim();
      const g = [r.ONE_GRADE_EVENT_YN, r.TW_GRADE_EVENT_YN, r.THREE_GRADE_EVENT_YN].map((v, i) => (v === 'Y' ? i + 1 : 0)).filter(Boolean);
      return { day: `${r.AA_YMD.slice(0, 4)}-${r.AA_YMD.slice(4, 6)}-${r.AA_YMD.slice(6, 8)}`, title: withGrades(name, g.length === 3 ? [] : g),
        category: r.SBTR_DD_SC_NM === '휴업일' ? 'holiday' : /시험|평가|고사/.test(name) ? 'exam' : 'school' };
    }).sort((a, b) => a.title.localeCompare(b.title) || a.category.localeCompare(b.category) || a.day.localeCompare(b.day));
    const merged = [];
    items.forEach(it => {
      const last = merged[merged.length - 1];
      if (last && last.title === it.title && last.category === it.category && (it.day === last.end || it.day === addDay(last.end))) last.end = it.day;
      else merged.push({ start: it.day, end: it.day, title: it.title, category: it.category });
    });
    const dot = d => d.replace(/-/g, '.');
    return merged.sort(byDate).map(e => `${dot(e.start)}${e.end !== e.start ? `~${dot(e.end)}` : ''}\t${e.title}\t${CATEGORY_NAMES[e.category]}`);
  }
  /* ---------- 다음 일정 D-day (오늘은 한국 시간 기준) ---------- */
  const dayNumber = d => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;
  const ddayText = e => { const n = dayNumber(e.start) - dayNumber(today); return n > 0 ? `D-${n}` : (n === 0 ? 'D-DAY' : '진행 중'); };
  function renderDday() {
    const pick = list => list.filter(e => e.end >= today).sort(byDate).slice(0, 3);
    // 학교 일정이 남지 않았으면(새 학년도 일정을 넣기 전 등) 다가오는 공휴일을 보여 줍니다.
    let upcoming = pick(events.filter(forGrade));
    if (!upcoming.length) upcoming = pick(publicHolidays);
    const box = $('dday');
    if (!upcoming.length) { box.innerHTML = '<p class="dday-label"><span>다음 일정</span></p><p class="dday-empty">남은 일정이 없습니다.<br>새 일정이 등록되면 여기에 표시됩니다.</p>'; return; }
    const [next, ...rest] = upcoming, cat = next.isPublic ? 'public' : next.category;
    const jump = e => (e.start < today ? today : e.start);
    box.innerHTML = `<p class="dday-label"><span>다음 일정</span><span class="dday-cat ${cat}">${categoryName(next)}</span></p>`
      + `<button type="button" class="dday-main" data-date="${jump(next)}"><strong class="dday-count ${cat}">${ddayText(next)}</strong><span class="dday-info"><b>${markTag(next, true)}${escapeHTML(next.title)}</b><span>${rangeText(next)}</span></span></button>`
      + (rest.length ? `<ol class="dday-list">${rest.map(e => `<li><button type="button" data-date="${jump(e)}"><span class="dday-date">${withWeekday(e.start)}</span><span class="dday-title">${markTag(e, true)}${escapeHTML(e.title)}</span><span class="dday-n">${ddayText(e)}</span></button></li>`).join('')}</ol>` : '');
  }
  function setMonth(next) { month = Math.max(0, Math.min(11, next)); selected = `${YEAR}-${pad(month + 1)}-01`; render(); focusSelected(); }
  function goTo(day, scroll) {
    if (!day.startsWith(`${YEAR}-`)) return;
    month = Number(day.slice(5, 7)) - 1; selected = day;
    if (view !== 'calendar') setView('calendar'); else render();
    focusSelected();
    if (scroll && $('calendarGrid').getBoundingClientRect().top > innerHeight * .6) $('calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 화면: 1년 목록 ---------- */
  function listYears() {
    const ys = [YEAR];
    if (isAdmin() && events.some(e => overlapsYear(e, YEAR + 1))) ys.push(YEAR + 1); // 관리자는 미리 넣은 다음 해 일정도 확인합니다.
    return ys;
  }
  function renderYear() {
    const years = listYears();
    if (!years.includes(listYear)) listYear = YEAR;
    $('yearSelectWrap').hidden = years.length < 2;
    $('yearSelect').innerHTML = years.map(y => `<option value="${y}"${y === listYear ? ' selected' : ''}>${y}년</option>`).join('');
    const own = events.filter(e => overlapsYear(e, listYear)).filter(forGrade);
    const hol = listYear === YEAR ? publicHolidays : holidaysFor(listYear);
    // 검색: 일정명·메모·분류·"12월"처럼 달 이름에서 찾고, 띄어쓰기는 무시합니다.
    const query = $('yearSearch').value.trim(), q = query.replace(/\s+/g, '').toLowerCase(), recentOnly = $('recentOnly').checked;
    const recentN = own.filter(markOf).length;
    $('recentWrap').hidden = !recentN && !recentOnly;
    $('recentCount').textContent = recentN ? `${recentN}건` : '';
    const hit = e => (!q || `${e.title}${e.note || ''}${categoryName(e)}${Number(e.start.slice(5, 7))}월`.replace(/\s+/g, '').toLowerCase().includes(q)) && (!recentOnly || markOf(e));
    const rows = own.concat(hol).filter(hit).sort((a, b) => a.start.localeCompare(b.start) || (b.isPublic ? 1 : 0) - (a.isPublic ? 1 : 0) || a.title.localeCompare(b.title));
    $('yearHeading').textContent = `${listYear}학년도 학사 일정`;
    $('yearSub').textContent = `${gradeFilter ? `${gradeFilter}학년 기준 ` : ''}일정 ${own.length}건 · 공휴일 함께 표시${q || recentOnly ? ` · 찾은 일정 ${rows.length}건` : ''}`;
    let html = '', current = -1;
    rows.forEach(e => {
      const m = Number((e.start < `${listYear}-01-01` ? `${listYear}-01-01` : e.start).slice(5, 7));
      if (m !== current) { current = m; html += `<tr class="month-row"><th colspan="3" scope="rowgroup">${m}월</th></tr>`; }
      const cat = e.isPublic ? 'public' : e.category, jump = e.start < `${listYear}-01-01` ? `${listYear}-01-01` : e.start;
      html += `<tr${listYear === YEAR ? ` data-date="${jump}"` : ''}${e.isPublic ? ' class="public"' : ''}><td class="yt-date">${rangeText(e)}</td><td class="yt-title">${markTag(e)}${escapeHTML(e.title)}${markOf(e) === 'changed' ? `<small class="yt-sub">원래 ${prevText(e)}</small>` : ''}${e.note ? `<small class="yt-sub">${escapeHTML(e.note)}</small>` : ''}</td><td class="yt-cat"><i class="dot ${cat}"></i>${categoryName(e)}</td></tr>`;
    });
    const empty = q ? `‘${escapeHTML(query)}’에 맞는 일정이 없습니다.` : recentOnly ? '최근 7일 동안 바뀐 일정이 없습니다.' : '등록된 일정이 없습니다.';
    $('yearBody').innerHTML = html || `<tr><td colspan="3" class="empty-agenda">${empty}</td></tr>`;
  }
  function setView(v) {
    view = v === 'list' ? 'list' : 'calendar';
    $('calendarView').hidden = view !== 'calendar';
    $('yearView').hidden = view !== 'list';
    document.body.classList.toggle('view-list', view === 'list');
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (view === 'list') { renderYear(); syncHash(); } else render();
  }

  /* ---------- 주소로 날짜 공유: …/#2026-12-03, 1년 목록은 #list ---------- */
  function readHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === 'list') return { view: 'list' };
    if (validDay(h) && h.startsWith(`${YEAR}-`)) return { view: 'calendar', day: h };
    return null;
  }
  function applyHash(h) {
    if (!h) return;
    if (h.day) { selected = h.day; month = Number(h.day.slice(5, 7)) - 1; }
    view = h.view;
  }
  function syncHash() {
    if (!booted) return;
    const h = view === 'list' ? '#list' : `#${selected}`;
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.append(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    t.remove(); return ok;
  }
  function flash(btn, text) {
    clearTimeout(btn._t); btn.textContent = text;
    btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; }, 1800);
  }

  /* ---------- 내 캘린더에 추가 (.ics) ---------- */
  const enc = new TextEncoder();
  function fold(line) { // iCalendar는 한 줄을 75바이트 이하로 접습니다(한글이 잘리지 않게 글자 단위로).
    if (enc.encode(line).length <= 75) return line;
    const out = []; let cur = '', size = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
      cur += ch; size += n;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  const icsYear = () => (view === 'list' ? listYear : YEAR);
  const icsEvents = y => events.filter(e => overlapsYear(e, y)).filter(forGrade).sort(byDate);
  function buildIcs(y) {
    const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const compact = d => d.replace(/-/g, '');
    const nextDay = d => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const name = `창의경영고 ${y}학년도 학사 일정${gradeFilter ? ` (${gradeFilter}학년)` : ''}`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Changui Academic Calendar//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Asia/Seoul'];
    icsEvents(y).forEach((e, i) => lines.push('BEGIN:VEVENT', `UID:${e.id || `basic-${e.start}-${i}`}@changui-calendar`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.end))}`, `SUMMARY:${esc(e.title)}`,
      `CATEGORIES:${esc(CATEGORY_NAMES[e.category])}`, ...(e.note ? [`DESCRIPTION:${esc(e.note)}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT'));
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function openIcs() {
    const y = icsYear(), n = icsEvents(y).length;
    $('icsSummary').textContent = `${y}학년도 · ${gradeFilter ? `${gradeFilter}학년과 전체 학년 일정` : '전체 학년'} · ${n}건${gradeFilter ? '' : ' (위에서 학년을 고르면 그 학년 일정만 받습니다)'}`;
    $('icsDownload').disabled = !n;
    $('icsDialog').showModal();
  }
  function downloadIcs() {
    const y = icsYear();
    const blob = new Blob([buildIcs(y)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `changui-calendar-${y}${gradeFilter ? `-grade${gradeFilter}` : ''}.ics`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /* ---------- 인쇄: 달력(한 달에 한 장, A4 가로) 또는 1년 목록 ---------- */
  // 인쇄용 내용은 화면 밖 #printSheet에 따로 만들고, 인쇄할 때만 화면 대신 보입니다(Ctrl+P도 같은 길로).
  let printKind = null;
  const printYear = () => (view === 'list' ? listYear : YEAR);
  const printEvents = y => (y === YEAR ? publicHolidays : holidaysFor(y)).concat(events.filter(e => overlapsYear(e, y)).filter(forGrade).sort(byDate));
  const PRINT_LEGEND = '<p class="pm-legend"><span><i class="dot exam"></i>시험</span><span><i class="dot school"></i>학교 일정</span><span><i class="dot holiday"></i>휴일·방학</span><span><i class="dot public"></i>공휴일</span></p>';
  function monthPage(y, m, shown) {
    const lead = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    let cells = '<div class="pm-cell blank"></div>'.repeat(lead);
    for (let n = 1; n <= days; n++) {
      const date = new Date(y, m, n), day = dateISO(date), dow = date.getDay(), list = shown.filter(e => isWithin(e, day));
      const red = dow === 0 || list.some(e => e.isPublic);
      cells += `<div class="pm-cell${red ? ' red' : dow === 6 ? ' sat' : ''}"><span class="pm-num">${n}</span>${list.map(e => `<span class="pm-ev ${e.isPublic ? 'public' : e.category}">${escapeHTML(e.title)}</span>`).join('')}</div>`;
    }
    cells += '<div class="pm-cell blank"></div>'.repeat((7 - (lead + days) % 7) % 7);
    const site = `${location.host}${location.pathname.replace(/index.html$/, '')}`;
    return `<section class="pm"><header class="pm-head"><div><p>창의경영고등학교 · ${y}학년도 학사 일정${gradeFilter ? ` · ${gradeFilter}학년 기준` : ''}</p><h2>${m + 1}<small>월</small></h2></div>${PRINT_LEGEND}</header>`
      + `<div class="pm-week">${[...WEEKDAYS].map(w => `<span>${w}</span>`).join('')}</div>`
      + `<div class="pm-grid" style="--rows:${Math.ceil((lead + days) / 7)}">${cells}</div>`
      + `<footer class="pm-foot"><span>일정은 학교 사정에 따라 바뀔 수 있습니다. 학교 공지와 함께 확인해 주세요.</span><span>${today.replace(/-/g, '.')} 인쇄 · ${escapeHTML(site)}</span></footer></section>`;
  }
  function preparePrint(kind) {
    const sheet = $('printSheet'), y = printYear();
    if (kind === 'list') {
      renderYear();
      const copy = $('yearView').cloneNode(true);
      copy.hidden = false;
      [copy, ...copy.querySelectorAll('[id]')].forEach(el => el.removeAttribute('id'));
      sheet.replaceChildren(copy);
    } else {
      const shown = printEvents(y), months = kind === 'month' && y === YEAR ? [month] : [...Array(12).keys()];
      sheet.innerHTML = months.map(m => monthPage(y, m, shown)).join('');
    }
    document.body.classList.add('printing');
  }
  function openPrint() {
    const y = printYear(), monthOk = y === YEAR && view === 'calendar';
    const pick = view === 'list' ? 'list' : 'month';
    $('printMonthLabel').textContent = `달력 · ${month + 1}월`;
    $('printForm').querySelector('[value="month"]').closest('label').hidden = !monthOk;
    $('printForm').querySelectorAll('[name="printKind"]').forEach(r => { r.checked = r.value === pick; });
    $('printSummary').textContent = `${y}학년도 · ${gradeFilter ? `${gradeFilter}학년과 전체 학년 일정` : '전체 학년 일정'} · 공휴일 함께 표시`;
    $('printDialog').showModal();
  }
  window.addEventListener('beforeprint', () => { preparePrint(printKind || (view === 'list' ? 'list' : 'month')); printKind = null; });

  /* ---------- 관리 창 ---------- */
  const gradeBoxes = () => [...$('gradePick').querySelectorAll('input')];
  const syncGradeBoxes = () => { const g = parseGrades($('eventTitle').value); gradeBoxes().forEach(b => { b.checked = g.includes(Number(b.value)); }); };
  function resetForm(message = '') {
    editingId = null;
    $('eventTitle').value = ''; $('eventCategory').value = 'school';
    $('eventStart').value = selected; $('eventEnd').value = selected;
    $('eventNote').value = ''; $('notifyWrap').hidden = true; $('notifyChange').checked = true;
    syncGradeBoxes();
    $('deleteEvent').hidden = true; $('newEvent').hidden = true;
    $('saveEvent').textContent = '일정 추가';
    $('saveMessage').textContent = message;
  }
  function setTab(t) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $('tabOne').hidden = t !== 'one';
    $('tabBulk').hidden = t !== 'bulk';
    if (t === 'bulk') { renderBulk(); $('bulkText').focus(); }
  }
  function openManage() {
    if (!session || session.role !== 'admin') return;
    $('roleNote').textContent = `${session.loginId} 계정(관리자)으로 일정을 관리합니다. 저장하면 바로 모든 방문자에게 보입니다.`;
    setTab('one');
    resetForm(); $('passwordForm').reset(); $('passwordMessage').textContent = '';
    renderManageList();
    if (!$('adminDialog').open) $('adminDialog').showModal();
    // 관리 창을 열 때는 저장된 사본 대신 최신 일정을 다시 받아 옵니다(다른 관리자가 고친 내용 반영).
    loadEvents(true).then(() => { render(); renderManageList(); if (!$('tabBulk').hidden) renderBulk(); });
  }
  function renderManageList() {
    const rows = monthEvents();
    $('manageMonth').textContent = `${month + 1}월`;
    $('manageCount').textContent = `${rows.length}건`;
    $('manageList').innerHTML = rows.length ? rows.map((e, i) => `<button type="button" class="manage-row${e.id && e.id === editingId ? ' active' : ''}" data-index="${i}"><span>${shortDate(e.start)}${e.end !== e.start ? `—${shortDate(e.end)}` : ''}</span><b>${escapeHTML(e.title)}</b><span>${e.id ? '고치기' : ''}</span></button>`).join('')
      : '<p class="empty-agenda">이 달에는 일정이 없습니다.</p>';
    $('manageList').querySelectorAll('.manage-row').forEach(btn => btn.addEventListener('click', () => startEdit(rows[Number(btn.dataset.index)])));
  }
  function startEdit(e) {
    if (!e.id) { $('saveMessage').textContent = '저장소에 연결되지 않은 기본 일정은 고칠 수 없습니다.'; return; }
    editingId = e.id;
    $('eventTitle').value = e.title; $('eventCategory').value = e.category;
    $('eventStart').value = e.start; $('eventEnd').value = e.end;
    $('eventNote').value = e.note || ''; $('notifyWrap').hidden = false; $('notifyChange').checked = true;
    syncGradeBoxes();
    $('deleteEvent').hidden = false; $('newEvent').hidden = false;
    $('saveEvent').textContent = '수정 저장';
    $('saveMessage').textContent = '선택한 일정을 고치는 중입니다.';
    renderManageList();
  }
  // 달력에서 두 번 누른 경우: 일정을 눌렀으면 그 일정, 일정이 하나뿐인 날이면 그 일정, 아니면 그 날짜로 새 일정
  function openEditor(day, eventId) {
    render();
    openManage();
    const dayEvents = events.filter(e => isWithin(e, day) && e.id);
    const target = events.find(e => eventId && e.id === eventId) || (dayEvents.length === 1 ? dayEvents[0] : null);
    if (target) startEdit(target);
    else if (dayEvents.length > 1) $('saveMessage').textContent = `이 날 일정이 ${dayEvents.length}개 있습니다. 고칠 일정은 달력에서 그 일정을 두 번 누르거나 아래 목록에서 고르세요.`;
    else $('saveMessage').textContent = `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일에 새 일정을 추가합니다.`;
    setTimeout(() => $('eventTitle').focus(), 0);
  }
  async function afterChange(message) {
    const s = $('eventStart').value;
    await touchMeta();
    await loadEvents(true);
    if (s && s.startsWith(`${YEAR}-`)) { month = Number(s.slice(5, 7)) - 1; selected = s; }
    if (view === 'list') renderYear(); else render();
    resetForm(message); renderManageList();
  }

  /* ---------- 여러 건 붙여넣기 ---------- */
  const CAT_WORDS = { '시험': 'exam', '학교 일정': 'school', '학교일정': 'school', '학교': 'school', '행사': 'school', '휴일·방학': 'holiday', '휴일': 'holiday', '방학': 'holiday', '휴업': 'holiday', '휴업일': 'holiday', '공휴일': 'holiday' };
  const guessCategory = t => (/예비소집/.test(t) ? 'school' : /휴업|방학|휴일|공휴|대체|선거일|개교기념/.test(t) ? 'holiday' : /시험|평가|고사|모의/.test(t) ? 'exam' : 'school');
  const DATE_AT = /^(?:(\d{4})\s*(?:[.\-/]|년)\s*)?(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})(?:\s*일)?\.?(?:\s*\(\s*[월화수목금토일]\s*\))?/;
  const DAY_AT = /^(\d{1,2})(?:\s*일)?\.?(?:\s*\(\s*[월화수목금토일]\s*\))?/;
  const RANGE_AT = /^\s*(?:~|∼|～|–|—|-|부터)\s*/;
  let bulkRows = [];
  const endsToken = s => /^(\s|$)/.test(s);
  function parseLine(raw, defYear, last, catCell = true) {
    // 엑셀 칸(탭)으로 붙여넣으면 요일만 있는 칸은 버리고, 마지막 칸이 분류 이름이면 분류로 씁니다.
    const cells = raw.split('\t').map(c => c.trim()).filter(c => c && !/^\(?[월화수목금토일](요일)?\)?$/.test(c));
    if (cells.length > 2 && /^\d{1,2}월?$/.test(cells[0]) && /^\d{1,2}일?$/.test(cells[1])) cells.splice(0, 2, `${parseInt(cells[0], 10)}.${parseInt(cells[1], 10)}`); // 월 칸 | 일 칸
    let category = '';
    if (catCell && cells.length > 1 && CAT_WORDS[cells[cells.length - 1]]) category = CAT_WORDS[cells.pop()];
    let text = cells.join(' ').replace(/\s+/g, ' ').trim();
    const err = error => ({ ok: false, line: raw.trim(), error });
    let y, m, d;
    let hit = DATE_AT.exec(text);
    if (hit) { y = Number(hit[1] || defYear); m = Number(hit[2]); d = Number(hit[3]); }
    else if (last && (hit = DAY_AT.exec(text)) && endsToken(text.slice(hit[0].length))) { y = last.y; m = last.m; d = Number(hit[1]); } // 앞 줄과 같은 달(엑셀 병합 칸)
    else return err('날짜를 찾지 못했습니다');
    text = text.slice(hit[0].length);
    const start = `${y}-${pad(m)}-${pad(d)}`;
    let end = start, endYearGiven = false;
    const sep = RANGE_AT.exec(text), afterSep = sep ? text.slice(sep[0].length) : '';
    const full = sep ? DATE_AT.exec(afterSep) : (/^\s/.test(text) ? DATE_AT.exec(text.trimStart()) : null);
    const dayOnly = sep && !full ? DAY_AT.exec(afterSep) : null;
    if (full) {
      endYearGiven = !!full[1];
      end = `${full[1] || y}-${pad(Number(full[2]))}-${pad(Number(full[3]))}`;
      text = (sep ? afterSep : text.trimStart()).slice(full[0].length);
    } else if (dayOnly && endsToken(afterSep.slice(dayOnly[0].length))) { // 3.26~28
      end = `${y}-${pad(m)}-${pad(Number(dayOnly[1]))}`;
      text = afterSep.slice(dayOnly[0].length);
    } // 그 밖의 "-"는 날짜와 일정명 사이의 구분 기호로 봅니다.
    if (!endYearGiven && end < start && validDay(end)) end = `${y + 1}${end.slice(4)}`; // 12.30~1.2처럼 해를 넘기는 기간
    text = text.replace(/^\s*까지/, '').replace(/^\s*[월화수목금토일](?=\s)/, '').replace(/^[\s:|·\-–—~,]+/, '').replace(/\s+/g, ' ').trim();
    if (!text && category) return parseLine(raw, defYear, last, false); // 마지막 칸이 "방학"처럼 분류 이름과 같은 일정명이었던 경우
    const ey = Number(end.slice(0, 4));
    if (y < 2000 || y > 2099 || ey > 2099) return err('연도가 맞지 않습니다');
    if (!validDay(start) || !validDay(end)) return err('없는 날짜입니다');
    if (end < start) return err('끝나는 날짜가 시작일보다 빠릅니다');
    if (!text) return err('일정명이 없습니다');
    if (text.length > 100) return err('일정명이 100자를 넘습니다');
    return { ok: true, start, end, title: text, category: category || guessCategory(text), y, m };
  }
  // 날짜가 겹치고 한쪽 이름이 다른 쪽에 들어 있으면(예: "졸업"과 "졸업식, 종업식") 같은 일정으로 봅니다.
  const baseTitle = t => String(t).replace(GRADE_ALL, '').replace(/\s/g, '');
  const similarTo = r => {
    const a = baseTitle(r.title);
    return a.length >= 2 && events.some(e => { const b = baseTitle(e.title); return e.start <= r.end && e.end >= r.start && b.length >= 2 && (b.includes(a) || a.includes(b)); });
  };
  function parseBulk() {
    const defYear = Number($('bulkYear').value), seen = new Set();
    let last = null;
    bulkRows = $('bulkText').value.split(/\r?\n/).filter(l => l.trim()).map(line => {
      const r = parseLine(line, defYear, last);
      if (!r.ok) return r;
      last = { y: r.y, m: r.m };
      const key = `${r.start}|${r.end}|${r.title.replace(/\s/g, '')}`;
      r.dup = seen.has(key) ? '위 줄과 같습니다' : events.some(e => `${e.start}|${e.end}|${e.title.replace(/\s/g, '')}` === key) ? '이미 있는 일정' : similarTo(r) ? '비슷한 일정이 이미 있음' : '';
      seen.add(key);
      return r;
    });
  }
  function renderBulk() {
    parseBulk();
    const ready = bulkRows.filter(r => r.ok && !r.dup);
    const box = $('bulkPreview');
    box.innerHTML = bulkRows.length ? `<table class="bulk-table"><thead><tr><th>날짜</th><th>일정명</th><th>분류</th></tr></thead><tbody>${bulkRows.map((r, i) => (r.ok
      ? `<tr${r.dup ? ' class="skip"' : ''}><td>${r.start.slice(0, 4)}.${rangeText(r)}</td><td>${escapeHTML(r.title)}${r.dup ? `<small>${r.dup} · 건너뜀</small>` : ''}</td><td><select data-row="${i}" aria-label="분류"${r.dup ? ' disabled' : ''}>${Object.entries(CATEGORY_NAMES).map(([k, v]) => `<option value="${k}"${k === r.category ? ' selected' : ''}>${v}</option>`).join('')}</select></td></tr>`
      : `<tr class="bad"><td colspan="2">${escapeHTML(r.line)}</td><td>${r.error}</td></tr>`)).join('')}</tbody></table>` : '';
    box.querySelectorAll('select[data-row]').forEach(s => s.addEventListener('change', () => { bulkRows[Number(s.dataset.row)].category = s.value; }));
    const bad = bulkRows.filter(r => !r.ok).length;
    $('bulkSave').disabled = !ready.length;
    $('bulkSave').textContent = ready.length ? `${ready.length}건 저장` : '저장할 일정 없음';
    $('bulkMessage').textContent = bad ? `읽지 못한 줄 ${bad}개는 저장하지 않습니다. 날짜를 맨 앞에 두고 다시 붙여넣어 보세요.` : '';
  }

  /* ---------- 이벤트 연결 ---------- */
  applyYear();
  applyHash(readHash());
  $('shareDay').dataset.label = $('shareDay').textContent;
  $('prevMonth').addEventListener('click', () => setMonth(month - 1));
  $('nextMonth').addEventListener('click', () => setMonth(month + 1));
  $('todayBtn').addEventListener('click', () => goTo(today, false));
  $('monthSelect').addEventListener('change', ev => setMonth(Number(ev.target.value)));
  $('calendarGrid').addEventListener('keydown', ev => {
    const current = ev.target.closest('[data-date]'); if (!current) return;
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key]; if (!offset) return;
    ev.preventDefault();
    const target = new Date(`${current.dataset.date}T00:00:00`); target.setDate(target.getDate() + offset);
    if (target.getFullYear() !== YEAR) return;
    month = target.getMonth(); selected = dateISO(target); render(); focusSelected();
  });
  function markGrade() {
    document.querySelectorAll('[data-grade]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.grade === gradeFilter)));
    showNote();
  }
  $('gradeFilter').addEventListener('click', ev => {
    const b = ev.target.closest('[data-grade]'); if (!b) return;
    gradeFilter = b.dataset.grade;
    try { localStorage.setItem(GRADE_KEY, gradeFilter); } catch {}
    markGrade(); renderDday();
    if (view === 'list') renderYear(); else render();
  });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('yearSelect').addEventListener('change', ev => { listYear = Number(ev.target.value); renderYear(); });
  $('yearSearch').addEventListener('input', renderYear);
  $('recentOnly').addEventListener('change', renderYear);
  $('mealBody').addEventListener('click', ev => { if (ev.target.closest('[data-meal-retry]')) renderMeal(); });
  $('yearBody').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-date]'); if (tr) goTo(tr.dataset.date, true); });
  $('printBtn').addEventListener('click', openPrint);
  $('printForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const kind = new FormData(ev.target).get('printKind') || 'year';
    $('printDialog').close();
    printKind = kind;
    preparePrint(kind); // beforeprint를 지원하지 않는 브라우저도 고른 모양으로 나오게 미리 만듭니다.
    setTimeout(() => window.print(), 60);
  });
  $('icsBtn').addEventListener('click', openIcs);
  $('icsDownload').addEventListener('click', () => { downloadIcs(); $('icsDialog').close(); });
  $('shareDay').addEventListener('click', async () => {
    const btn = $('shareDay'), url = `${location.origin}${location.pathname}#${selected}`;
    const dt = new Date(`${selected}T00:00:00`), title = `${dt.getMonth() + 1}월 ${dt.getDate()}일 학사 일정 · 창의경영고`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    flash(btn, (await copyText(url)) ? '복사했습니다' : '복사하지 못했습니다');
  });
  window.addEventListener('hashchange', () => {
    const h = readHash(); if (!h) return;
    if (h.view === 'list') { if (view !== 'list') setView('list'); }
    else goTo(h.day, true);
  });
  $('loginBtn').addEventListener('click', () => {
    $('loginMessage').textContent = fb ? '' : '로그인 기능이 아직 연결되지 않았습니다.';
    $('loginDialog').showModal();
  });
  $('adminBtn').addEventListener('click', openManage);
  $('dday').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-date]'); if (!btn) return;
    goTo(btn.dataset.date, true);
  });
  $('logoutBtn').addEventListener('click', signOut);
  $('termsBtn').addEventListener('click', () => $('termsDialog').showModal());
  $('termsInline').addEventListener('click', () => $('termsDialog').showModal());
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  $('loginForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!fb) return;
    const msg = $('loginMessage'), id = $('loginId').value.trim();
    if (!/^[a-z0-9._-]{2,32}$/i.test(id)) { msg.textContent = '아이디는 영문, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 입력해 주세요.'; return; }
    msg.textContent = '로그인 중입니다…';
    try {
      await signIn(id, $('password').value);
      $('password').value = ''; msg.textContent = '';
      showAuth(); $('loginDialog').close(); openManage();
    } catch (e) { msg.textContent = authError(e.message); }
  });

  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('eventTitle').addEventListener('input', syncGradeBoxes);
  $('gradePick').addEventListener('change', () => {
    $('eventTitle').value = withGrades($('eventTitle').value, gradeBoxes().filter(b => b.checked).map(b => Number(b.value)));
  });
  $('eventForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = $('saveMessage');
    const e = { title: $('eventTitle').value.trim(), category: $('eventCategory').value, start: $('eventStart').value, end: $('eventEnd').value, note: $('eventNote').value.trim().slice(0, 300) };
    if (!e.title) { msg.textContent = '일정명을 입력해 주세요.'; return; }
    if (!e.start || !e.end) { msg.textContent = '시작일과 종료일을 입력해 주세요.'; return; }
    if (e.start > e.end) { msg.textContent = '종료일은 시작일보다 빠를 수 없습니다.'; return; }
    if (editingId) Object.assign(e, changeRecord(events.find(x => x.id === editingId) || {}, e, $('notifyChange').checked));
    else e.createdAt = new Date().toISOString();
    msg.textContent = '저장 중입니다…';
    try { await saveEvent(e, editingId); await afterChange(editingId ? '일정을 수정했습니다.' : '일정을 추가했습니다.'); }
    catch (err) { msg.textContent = err.message === 'PERMISSION' ? '권한이 없어 저장하지 못했습니다. 다시 로그인해 주세요.' : '저장하지 못했습니다. 인터넷 연결을 확인해 주세요.'; }
  });
  $('newEvent').addEventListener('click', () => { resetForm(); renderManageList(); });
  $('deleteEvent').addEventListener('click', async () => {
    if (!editingId || !confirm('이 일정을 삭제할까요? 삭제하면 되돌릴 수 없습니다.')) return;
    $('saveMessage').textContent = '삭제 중입니다…';
    try { await removeEvent(editingId); await afterChange('일정을 삭제했습니다.'); }
    catch (err) { $('saveMessage').textContent = err.message === 'PERMISSION' ? '권한이 없어 삭제하지 못했습니다.' : '삭제하지 못했습니다. 인터넷 연결을 확인해 주세요.'; }
  });

  let bulkTimer = 0;
  $('bulkText').addEventListener('input', () => { clearTimeout(bulkTimer); bulkTimer = setTimeout(renderBulk, 200); });
  $('bulkYear').addEventListener('change', () => { $('neisYear').textContent = $('bulkYear').value; renderBulk(); });
  $('neisImport').closest('.neis-row').hidden = !neis;
  $('neisImport').addEventListener('click', async () => {
    const btn = $('neisImport'), msg = $('bulkMessage'), y = Number($('bulkYear').value);
    if ($('bulkText').value.trim() && !confirm('붙여넣기 칸에 적힌 내용을 지우고 나이스 일정으로 채울까요?')) return;
    btn.disabled = true; msg.textContent = '';
    try {
      const lines = neisLines(await neisSchedule(y, n => { btn.textContent = `불러오는 중… ${n}`; }));
      if (!lines.length) { msg.textContent = `나이스에 ${y}년 학사일정이 아직 없습니다. 학교가 나이스에 올린 뒤 다시 불러오세요.`; return; }
      $('bulkText').value = lines.join('\n');
      renderBulk();
      const ready = bulkRows.filter(r => r.ok && !r.dup).length;
      msg.textContent = `나이스에서 ${lines.length}건을 불러왔습니다. 그중 ${ready}건이 새로 저장됩니다. 넣지 않을 줄은 위 칸에서 지운 뒤 저장하세요.`;
    } catch { msg.textContent = '나이스에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'; }
    finally { btn.disabled = false; btn.textContent = '나이스에서 불러오기'; }
  });
  $('bulkClear').addEventListener('click', () => { $('bulkText').value = ''; renderBulk(); $('bulkText').focus(); });
  $('bulkSave').addEventListener('click', async () => {
    const list = bulkRows.filter(r => r.ok && !r.dup).map(({ start, end, title, category }) => ({ start, end, title, category }));
    if (!list.length) return;
    const msg = $('bulkMessage'), btn = $('bulkSave');
    btn.disabled = true; msg.textContent = `${list.length}건을 저장하는 중입니다…`;
    try {
      await saveMany(list);
      await touchMeta();
      await loadEvents(true);
      $('bulkText').value = ''; renderBulk();
      const later = list.filter(e => e.start > yearEnd).length;
      msg.textContent = `${list.length}건을 저장했습니다.${later ? ` 그중 ${YEAR + 1}년 일정 ${later}건은 1년 목록에서 ${YEAR + 1}년을 골라 확인할 수 있고, ${YEAR + 1}년 1월 1일부터 달력에 나옵니다.` : ''}`;
      if (view === 'list') renderYear(); else render();
      renderManageList();
    } catch (err) {
      btn.disabled = false;
      msg.textContent = err.message === 'PERMISSION' ? '권한이 없어 저장하지 못했습니다. 다시 로그인해 주세요. 아무것도 저장되지 않았습니다.' : '저장하지 못했습니다. 인터넷 연결을 확인해 주세요.';
    }
  });

  $('passwordForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = $('passwordMessage'), cur = $('currentPassword').value, next = $('newPassword').value;
    if (next.length < 8) { msg.textContent = '새 비밀번호는 8자 이상으로 정해 주세요.'; return; }
    if (next !== $('newPassword2').value) { msg.textContent = '새 비밀번호 두 칸이 서로 다릅니다.'; return; }
    if (next === cur) { msg.textContent = '지금 비밀번호와 다른 비밀번호를 정해 주세요.'; return; }
    msg.textContent = '바꾸는 중입니다…';
    try {
      keep(await authPost('accounts:signInWithPassword', { email: loginEmail(session.loginId), password: cur, returnSecureToken: true }));
      keep(await authPost('accounts:update', { idToken: session.idToken, password: next, returnSecureToken: true }));
      $('passwordForm').reset(); msg.textContent = '비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.';
    } catch (e) { msg.textContent = /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/.test(e.message) ? '현재 비밀번호가 맞지 않습니다.' : authError(e.message); }
  });

  /* ---------- 홈 화면에 추가 (PWA) ---------- */
  let installPrompt = null;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installPrompt = ev; $('installBtn').hidden = false; });
  window.addEventListener('appinstalled', () => { installPrompt = null; $('installBtn').hidden = true; $('installHint').hidden = true; });
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone) $('installBtn').hidden = false; // iOS는 설치 창이 없어 방법을 알려 줍니다.
  $('installBtn').addEventListener('click', async () => {
    if (installPrompt) { installPrompt.prompt(); try { await installPrompt.userChoice; } catch {} installPrompt = null; $('installBtn').hidden = true; return; }
    $('installHint').hidden = !$('installHint').hidden;
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // 페이지를 켜 둔 채 날짜가 바뀌면 D-day와 '오늘' 표시를 새로 고칩니다. 해가 바뀌면 새 해 달력으로 다시 엽니다.
  function checkDay() {
    const now = kstToday();
    if (now === today) return;
    if (Number(now.slice(0, 4)) > YEAR) { if (!document.querySelector('dialog[open]')) location.reload(); return; }
    today = now; renderDday();
    if (view === 'list') renderYear(); else render();
  }
  setInterval(checkDay, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  window.addEventListener('focus', checkDay);

  (async () => {
    markGrade();
    await loadEvents();
    setView(view);
    booted = true;
    if (location.hash) syncHash();
    await restoreSession();
    showAuth();
  })();
})();
