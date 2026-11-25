(() => {
  const cfg = window.SCHOOL_CALENDAR_CONFIG || {};
  const fb = cfg.firebase && cfg.firebase.apiKey && cfg.firebase.projectId ? cfg.firebase : null;
  const $ = id => document.getElementById(id);
  const DOCS = fb ? `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/(default)/documents` : '';
  const AUTH = 'https://identitytoolkit.googleapis.com/v1';
  const SESSION_KEY = 'changuiCalendarSession';
  const CATEGORY_NAMES = { exam: '시험', school: '학교 일정', holiday: '휴일·방학' };
  const seasonNames = ['겨울의 시작','새 학기의 봄','꽃 피는 봄','초록의 봄','초여름','여름의 문턱','한여름','여름의 끝','가을의 시작','깊어지는 가을','겨울의 문턱','한 해의 끝'];

  // 한국 시간 기준 오늘. 해가 바뀌면 그 해 학사 일정을 자동으로 보여 줍니다(2027년이 되면 2027학년도).
  const kst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((date, part) => ({ ...date, [part.type]: part.value }), {});
  const YEAR = Math.max(2026, Number(kst.year));
  const pad = n => String(n).padStart(2, '0');
  const dateISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const yearStart = `${YEAR}-01-01`, yearEnd = `${YEAR}-12-31`;
  let selected = Number(kst.year) === YEAR ? `${kst.year}-${kst.month}-${kst.day}` : yearStart;
  let month = Number(selected.slice(5, 7)) - 1;
  let events = [], editingId = null, session = null;
  const today = `${kst.year}-${kst.month}-${kst.day}`;
  let lastTap = { day: '', at: 0 }; // 같은 날짜를 짧은 간격으로 두 번 누르면 편집 (마우스 더블 클릭·휴대폰 두 번 탭 공통)
  const DOUBLE_TAP_MS = 450;
  const isAdmin = () => !!session && session.role === 'admin';

  const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const categoryOf = c => (CATEGORY_NAMES[c] ? c : 'school');
  const shortDate = d => d.slice(5).replace('-', '.');
  const isWithin = (e, day) => e.start <= day && day <= e.end;
  const inYear = e => e.start <= yearEnd && e.end >= yearStart;
  const monthRange = () => [`${YEAR}-${pad(month + 1)}-01`, dateISO(new Date(YEAR, month + 1, 0))];
  const monthEvents = () => { const [a, b] = monthRange(); return events.filter(e => e.start <= b && e.end >= a).sort((x, y) => x.start.localeCompare(y.start) || x.title.localeCompare(y.title)); };

  function applyYear() {
    document.title = `창의경영고등학교 · ${YEAR} 학사 달력`;
    $('heroYear').textContent = String(YEAR);
    $('footerYear').textContent = `${YEAR}학년도`;
    $('monthSelect').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i + 1}월</option>`).join('');
  }

  /* ---------- 일정 데이터 (Firestore REST) ---------- */
  const fromDoc = d => {
    const f = d.fields || {}, v = k => (f[k] && f[k].stringValue) || '';
    return { id: d.name.split('/').pop(), start: v('start'), end: v('end'), title: v('title'), category: categoryOf(v('category')), updatedAt: (f.updatedAt && f.updatedAt.timestampValue) || '' };
  };
  const kstDate = t => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)).replace(/\s/g, '').replace(/\.$/, '');
  async function loadEvents() {
    let list = null;
    if (fb) {
      try {
        list = []; let pageToken = '';
        do {
          const r = await fetch(`${DOCS}/events?pageSize=300&key=${fb.apiKey}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
          if (!r.ok) throw new Error(String(r.status));
          const j = await r.json();
          (j.documents || []).forEach(d => { const e = fromDoc(d); if (e.start && e.end && e.title) list.push(e); });
          pageToken = j.nextPageToken || '';
        } while (pageToken);
      } catch { list = null; }
    }
    events = list || JSON.parse($('initialEvents').textContent);
    $('eventCount').textContent = `${events.filter(inYear).length}개 일정`;
    renderDday();
    const latest = list ? list.reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), '') : '';
    $('footerUpdated').hidden = !latest;
    if (latest) $('footerUpdated').textContent = `일정 업데이트 ${kstDate(latest)}`;
  }
  const eventFields = e => ({ fields: {
    start: { stringValue: e.start }, end: { stringValue: e.end }, title: { stringValue: e.title },
    category: { stringValue: e.category }, updatedAt: { timestampValue: new Date().toISOString() } } });
  async function authedFetch(url, opts = {}) {
    const token = await idToken();
    return fetch(url, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
  }
  async function saveEvent(e, id) {
    const mask = ['start', 'end', 'title', 'category', 'updatedAt'].map(k => `updateMask.fieldPaths=${k}`).join('&');
    const r = id
      ? await authedFetch(`${DOCS}/events/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, { method: 'PATCH', body: JSON.stringify(eventFields(e)) })
      : await authedFetch(`${DOCS}/events`, { method: 'POST', body: JSON.stringify(eventFields(e)) });
    if (!r.ok) throw new Error(r.status === 403 ? 'PERMISSION' : 'SAVE_FAILED');
  }
  async function removeEvent(id) {
    const r = await authedFetch(`${DOCS}/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(r.status === 403 ? 'PERMISSION' : 'DELETE_FAILED');
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
    $('legendNote').textContent = admin ? '날짜나 일정을 두 번 누르면 바로 추가·수정할 수 있습니다.' : '날짜를 선택하면 해당 일정이 표시됩니다.';
  }

  /* ---------- 화면 ---------- */
  function render() {
    $('monthNumber').textContent = pad(month + 1);
    $('monthSelect').value = String(month);
    $('monthKicker').textContent = `${YEAR}학년도 · ${seasonNames[month]}`;
    $('calendarGrid').setAttribute('aria-label', `${YEAR}년 ${month + 1}월 학사 일정`);
    $('prevMonth').disabled = month === 0;
    $('nextMonth').disabled = month === 11;
    $('hero').dataset.month = String(month + 1);
    const grid = $('calendarGrid');
    grid.innerHTML = '';
    const first = new Date(YEAR, month, 1), days = new Date(YEAR, month + 1, 0).getDate();
    const blank = () => { const b = document.createElement('div'); b.className = 'day empty'; b.setAttribute('aria-hidden', 'true'); grid.append(b); };
    for (let i = 0; i < first.getDay(); i++) blank();
    for (let n = 1; n <= days; n++) {
      const date = new Date(YEAR, month, n), day = dateISO(date), dayEvents = events.filter(e => isWithin(e, day));
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `day${date.getDay() === 0 ? ' sunday' : ''}${date.getDay() === 6 ? ' saturday' : ''}${day === selected ? ' selected' : ''}${dayEvents.length ? ' has-event' : ''}`;
      cell.dataset.date = day;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-selected', String(day === selected));
      cell.setAttribute('aria-label', `${month + 1}월 ${n}일${dayEvents.length ? `, 일정 ${dayEvents.length}개` : ''}`);
      cell.innerHTML = `<span class="day-num">${n}</span><span class="day-events">${dayEvents.map(e => `<span class="event-chip ${categoryOf(e.category)}" data-id="${escapeHTML(e.id || '')}">${escapeHTML(e.title)}</span>`).join('')}</span>`;
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
  }
  const focusSelected = () => { const el = $('calendarGrid').querySelector(`[data-date="${selected}"]`); if (el) el.focus({ preventScroll: true }); };
  function renderAgenda() {
    const dt = new Date(`${selected}T00:00:00`);
    $('agendaHeading').textContent = `${dt.getMonth() + 1}월 일정`;
    $('agendaDate').textContent = `${dt.getMonth() + 1}월 ${dt.getDate()}일 · ${'일월화수목금토'[dt.getDay()]}요일`;
    const found = events.filter(e => isWithin(e, selected));
    $('agendaList').innerHTML = found.length ? found.map(e => `<article class="agenda-item"><span class="agenda-marker ${categoryOf(e.category)}"></span><div><span class="agenda-range">${e.start === e.end ? shortDate(e.start) : `${shortDate(e.start)} — ${shortDate(e.end)}`}</span><h4>${escapeHTML(e.title)}</h4></div><span class="category-label">${CATEGORY_NAMES[categoryOf(e.category)]}</span></article>`).join('')
      : '<div class="empty-agenda">등록된 일정이 없는 날입니다.</div>';
  }
  /* ---------- 다음 일정 D-day (오늘은 한국 시간 기준) ---------- */
  const dayNumber = d => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;
  const withWeekday = d => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}(${'일월화수목금토'[new Date(`${d}T00:00:00`).getDay()]})`;
  const ddayText = e => { const n = dayNumber(e.start) - dayNumber(today); return n > 0 ? `D-${n}` : (n === 0 ? 'D-DAY' : '진행 중'); };
  function renderDday() {
    const upcoming = events.filter(e => e.end >= today).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title)).slice(0, 3);
    const box = $('dday');
    if (!upcoming.length) { box.innerHTML = '<p class="dday-label"><span>다음 일정</span></p><p class="dday-empty">남은 일정이 없습니다.<br>새 일정이 등록되면 여기에 표시됩니다.</p>'; return; }
    const [next, ...rest] = upcoming, cat = categoryOf(next.category);
    const range = next.start === next.end ? withWeekday(next.start) : `${withWeekday(next.start)} ~ ${withWeekday(next.end)}`;
    const jump = e => (e.start < today ? today : e.start);
    box.innerHTML = `<p class="dday-label"><span>다음 일정</span><span class="dday-cat ${cat}">${CATEGORY_NAMES[cat]}</span></p>`
      + `<button type="button" class="dday-main" data-date="${jump(next)}"><strong class="dday-count ${cat}">${ddayText(next)}</strong><span class="dday-info"><b>${escapeHTML(next.title)}</b><span>${range}</span></span></button>`
      + (rest.length ? `<ol class="dday-list">${rest.map(e => `<li><button type="button" data-date="${jump(e)}"><span class="dday-date">${withWeekday(e.start)}</span><span class="dday-title">${escapeHTML(e.title)}</span><span class="dday-n">${ddayText(e)}</span></button></li>`).join('')}</ol>` : '');
  }
  function setMonth(next) { month = Math.max(0, Math.min(11, next)); selected = `${YEAR}-${pad(month + 1)}-01`; render(); focusSelected(); }

  /* ---------- 관리 창 ---------- */
  function resetForm(message = '') {
    editingId = null;
    $('eventTitle').value = ''; $('eventCategory').value = 'school';
    $('eventStart').value = selected; $('eventEnd').value = selected;
    $('deleteEvent').hidden = true; $('newEvent').hidden = true;
    $('saveEvent').textContent = '일정 추가';
    $('saveMessage').textContent = message;
  }
  function openManage() {
    if (!session || session.role !== 'admin') return;
    $('roleNote').textContent = `${session.loginId} 계정(관리자)으로 일정을 관리합니다. 저장하면 바로 모든 방문자에게 보입니다.`;
    resetForm(); $('passwordForm').reset(); $('passwordMessage').textContent = '';
    renderManageList();
    if (!$('adminDialog').open) $('adminDialog').showModal();
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
    $('eventTitle').value = e.title; $('eventCategory').value = categoryOf(e.category);
    $('eventStart').value = e.start; $('eventEnd').value = e.end;
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
    await loadEvents();
    if (s && s.startsWith(`${YEAR}-`)) { month = Number(s.slice(5, 7)) - 1; selected = s; }
    render(); resetForm(message); renderManageList();
  }

  /* ---------- 이벤트 연결 ---------- */
  applyYear();
  $('prevMonth').addEventListener('click', () => setMonth(month - 1));
  $('nextMonth').addEventListener('click', () => setMonth(month + 1));
  $('monthSelect').addEventListener('change', ev => setMonth(Number(ev.target.value)));
  $('calendarGrid').addEventListener('keydown', ev => {
    const current = ev.target.closest('[data-date]'); if (!current) return;
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key]; if (!offset) return;
    ev.preventDefault();
    const target = new Date(`${current.dataset.date}T00:00:00`); target.setDate(target.getDate() + offset);
    if (target.getFullYear() !== YEAR) return;
    month = target.getMonth(); selected = dateISO(target); render(); focusSelected();
  });
  $('loginBtn').addEventListener('click', () => {
    $('loginMessage').textContent = fb ? '' : '로그인 기능이 아직 연결되지 않았습니다.';
    $('loginDialog').showModal();
  });
  $('adminBtn').addEventListener('click', openManage);
  $('dday').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-date]'); if (!btn) return;
    const d = btn.dataset.date;
    if (!d.startsWith(`${YEAR}-`)) return;
    month = Number(d.slice(5, 7)) - 1; selected = d; render(); focusSelected();
    if ($('calendarGrid').getBoundingClientRect().top > innerHeight * .6) $('calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  $('eventForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = $('saveMessage');
    const e = { title: $('eventTitle').value.trim(), category: $('eventCategory').value, start: $('eventStart').value, end: $('eventEnd').value };
    if (!e.title) { msg.textContent = '일정명을 입력해 주세요.'; return; }
    if (!e.start || !e.end) { msg.textContent = '시작일과 종료일을 입력해 주세요.'; return; }
    if (e.start > e.end) { msg.textContent = '종료일은 시작일보다 빠를 수 없습니다.'; return; }
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

  (async () => {
    await loadEvents();
    render();
    await restoreSession();
    showAuth();
  })();
})();
