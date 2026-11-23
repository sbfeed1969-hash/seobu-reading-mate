// 서부 리딩 메이트 서비스 워커
// - 항상 네트워크(최신 화면)를 먼저 받고, 연결이 끊겼을 때만 저장해 둔 화면을 보여줍니다.
// - 같은 사이트의 GET 요청만 다룹니다. Supabase 데이터 요청은 건드리지 않습니다.
const CACHE = "reading-mate-v1";
const CORE = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return; // 로그인·검색 서버 요청은 그대로 통과
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === "navigate" ? "/" : req).then((m) => m || caches.match("/")))
  );
});
