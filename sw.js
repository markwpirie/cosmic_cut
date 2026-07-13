// COSMIC CUT — service worker (Phase 8, PWA)
// Three caches, three strategies:
//   CORE_CACHE  — index/styles/manifest/src/*.js/icons: stale-while-revalidate
//                 (serve cached instantly, refresh in the background — a code
//                 change lands on the NEXT load, not the one after a manual bump).
//   MEDIA_CACHE — assets/*.mp3: cache-on-demand, NEVER precached (~39MB). Serves
//                 Range requests (206) sliced from a cached full file — required
//                 for HTMLAudioElement/iOS, which streams via Range, not a
//                 straight GET.
//   CDN_CACHE   — the Pixi CDN (cdn.jsdelivr.net) + Google Fonts: cache-first, so
//                 offline play and Orbitron still work after one online visit.
// CORE_CACHE is versioned (bump on a real deploy so old clients pick up new
// code promptly via skipWaiting+clients.claim); MEDIA_CACHE/CDN_CACHE are not —
// there's no reason to re-download a 5MB track or the Pixi bundle on every deploy.

const CACHE_VERSION = "v2";
const CORE_CACHE = `cosmic-cut-core-${CACHE_VERSION}`;
const MEDIA_CACHE = "cosmic-cut-media";
const CDN_CACHE = "cosmic-cut-cdn";

// Warmed explicitly on install rather than left to passive fetch interception:
// dynamic import() of a bare specifier resolved via the importmap doesn't
// reliably go through the SW's "fetch" event in every engine, so a plain
// fetch()+cache.put() here is the only guaranteed way to get offline play
// working after a single online visit. Keep in sync with index.html's importmap.
const CDN_ASSETS = [
  "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs",
  "https://cdn.jsdelivr.net/npm/pixi-filters@6/dist/pixi-filters.mjs",
];

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./src/main.js",
  "./src/config.js",
  "./src/control.js",
  "./src/grid.js",
  "./src/marker.js",
  "./src/enemy.js",
  "./src/sparx.js",
  "./src/powerups.js",
  "./src/game.js",
  "./src/levels.js",
  "./src/audio.js",
  "./src/audio-director.js",
  "./src/fx.js",
  "./src/render-pixi.js",
  "./src/reveal.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.all([
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {}),
    // Best-effort: offline play still works even if this fails (e.g. installing
    // while offline) — the CDN request just falls through to the network as usual.
    caches.open(CDN_CACHE).then((cache) =>
      Promise.all(CDN_ASSETS.map((url) =>
        fetch(url, { mode: "cors" }).then((res) => { if (res.ok) return cache.put(url, res); }).catch(() => {})
      ))
    ),
  ]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CORE_CACHE, MEDIA_CACHE, CDN_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CORE_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

// Slice a fully-cached Response into the requested byte range (206), or return
// it whole if no Range header was sent.
async function serveRange(cachedResponse, request) {
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) return cachedResponse.clone();
  const buf = await cachedResponse.clone().arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  const start = m ? parseInt(m[1], 10) : 0;
  const end = m && m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cachedResponse.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

async function handleMedia(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request.url, { ignoreSearch: true });
  if (cached) return serveRange(cached, request);
  // Not cached yet: serve this request straight from the network (honours any
  // Range header as-is), and separately warm the cache with the FULL file in the
  // background so future plays — and Range requests — can be served offline.
  fetch(request.url).then((full) => {
    if (full.ok) cache.put(request.url, full);
  }).catch(() => {});
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (/\.mp3$/i.test(url.pathname)) { event.respondWith(handleMedia(req)); return; }
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req, CDN_CACHE));
  }
  // Everything else (analytics, etc., if any is ever added): default browser behaviour.
});
