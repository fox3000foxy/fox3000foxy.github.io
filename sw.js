const CACHE = "img-v1";
const IMG_RE = /\.(jpe?g|png|gif|svg|webp|avif|ico)(\?.*)?$/i;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

self.addEventListener("fetch", (e) => {
  if (!IMG_RE.test(e.request.url)) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fetchAndCache = fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        });
        return cached || fetchAndCache;
      })
    )
  );
});
