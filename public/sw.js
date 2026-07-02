const CACHE_VERSION = "v2";
const STATIC_CACHE = `arpic-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `arpic-dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/service",
  "/admin",
  "/output",
  "/manifest.json",
  "/static/mediapipe/wasm/vision_wasm_internal.js",
  "/static/mediapipe/wasm/vision_wasm_internal.wasm",
  "/static/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/static/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "/static/mediapipe/model/selfie_multiclass_256x256.tflite",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("arpic-") && k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 결제 API는 항상 네트워크 우선 (오프라인 시 실패 허용)
  if (url.pathname.startsWith("/api/payments")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 일반 API는 네트워크 우선, 실패 시 캐시 폴백
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 정적 에셋 및 페이지: 캐시 우선
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
    )
  );
});
