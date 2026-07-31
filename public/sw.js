// Minimal offline-support service worker. No build-time asset manifest (no
// PWA plugin) — instead it opportunistically caches whatever the app
// actually requests during a successful online visit, so the current day's
// puzzle keeps working offline once it's been loaded. Spec §2.1 / §5.3.

const CACHE_NAME = "ballpark-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match("/index.html")) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations network-first (so today's schedule/content updates show up
  // while online); hashed build assets and content JSON cache-first since
  // they're effectively immutable once fetched.
  event.respondWith(request.mode === "navigate" ? networkFirst(request) : cacheFirst(request));
});
