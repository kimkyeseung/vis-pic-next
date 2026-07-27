// AR-pic 서비스워커
//
// 설계 원칙 (재배포 후 stale 화면·인증 깨짐이 재발하지 않도록):
//  1. HTML/네비게이션·RSC 요청은 "네트워크 우선" — 온라인이면 항상 최신을 받는다.
//     (과거 cache-first가 옛 번들/리다이렉트된 페이지를 서빙해 로그인 후 무한 깜빡임을 유발했다)
//  2. 인증·결제 등 민감 경로(/admin, /api/admin, /api/payments)는 SW가 절대 개입하지 않는다(네트워크 전용).
//  3. 내용 해시가 붙은 불변 빌드 애셋(_next/static, static/mediapipe)만 캐시 우선.
//  4. 리다이렉트된 응답·비정상 응답·비GET은 캐시하지 않는다.
//  5. 프리캐시는 실패해도 설치를 막지 않는다(개별 add + catch). 존재하지 않을 수 있는
//     런타임 다운로드 애셋(mediapipe)은 프리캐시하지 않는다.
//
// 참고: 이 SW는 배포(HTTPS) 호스트에서만 동작한다. Tauri 키오스크(localhost)에서는
// layout.tsx가 SW를 등록 해제한다.

const CACHE_VERSION = "v3";
const STATIC_CACHE = `arpic-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `arpic-dynamic-${CACHE_VERSION}`;

// 오프라인 폴백용 최소 프리캐시 (인증 불필요 페이지만). 온라인 동작은 아래 fetch 전략이 결정한다.
const PRECACHE_ASSETS = ["/", "/service", "/output", "/manifest.json"];

// 캐시 금지·네트워크 전용 경로 (인증/결제).
function isNetworkOnly(pathname) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/payments")
  );
}

// 내용 해시 불변 애셋 — 캐시 우선이 안전(파일명이 바뀌면 새로 받는다).
function isImmutableAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/static/mediapipe/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // 개별 add + catch: 일부 리소스가 없어도(404) 설치 전체가 실패하지 않도록.
      Promise.all(PRECACHE_ASSETS.map((asset) => cache.add(asset).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("arpic-") && k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GET·동일 출처만 처리. 그 외(POST, 외부 요청)는 SW 개입 없이 네트워크로.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // 인증/결제: 캐시 절대 금지, 항상 네트워크(SW 미개입).
  if (isNetworkOnly(url.pathname)) return;

  // 불변 빌드 애셋: 캐시 우선.
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok && !res.redirected) {
              const clone = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // 그 외(HTML 네비게이션·RSC·일반 API): 네트워크 우선 + 오프라인 시 캐시 폴백.
  // 온라인이면 항상 최신을 받으므로 재배포 후 stale 번들/화면 문제가 없다.
  event.respondWith(
    fetch(request)
      .then((res) => {
        // 리다이렉트된 응답을 캐시해 두면 이후 네비게이션이 깨진다 → 정상 응답만 캐시.
        if (res.ok && !res.redirected) {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
