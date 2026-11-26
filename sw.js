// 홈 화면에 추가한 뒤에도 인터넷이 끊기면 마지막으로 본 화면을 보여 주는 서비스 워커입니다.
// 이 사이트의 파일만 저장합니다. 일정 데이터(Firestore)와 로그인 요청은 건드리지 않습니다.
// 화면 파일을 크게 바꾸면 CACHE 이름의 날짜를 올려 지난 사본을 지웁니다.
const CACHE = 'changui-calendar-20261127';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 페이지는 항상 새로 받고, 받지 못할 때만 저장해 둔 페이지를 씁니다.
  if (req.mode === 'navigate') {
    const page = self.registration.scope;
    event.respondWith(fetch(req)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(page, copy)); } return res; })
      .catch(() => caches.match(page)));
    return;
  }

  // 스타일·스크립트·글꼴·아이콘: 저장된 사본을 먼저 보여 주고 뒤에서 새로 받아 둡니다.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
