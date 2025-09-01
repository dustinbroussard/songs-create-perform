"use strict";
const CACHE_VERSION = "v15"; // bump on SW-related changes
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll([
          "./",
          "index.html",
          "editor/editor.html",
          "performance/performance.html",
          "assets/offline.html",
          "style.css",
          "editor/editor.css",
          "performance/performance.css",
          "lib/fuse.js",
          "lib/Sortable.min.js",
          "lib/mammoth.browser.min.js",
          "config.js",
          "utils.js",
          "script.js",
          "editor/editor.js",
          "performance/performance.js",
          "core/song-core.js",
          "editor/songs.js",

          // App assets for offline logo/icon support
          "assets/images/mylogo.png",
          "assets/favicon.svg",
          "assets/icons/icon-48x48.png",
          "assets/icons/icon-96x96.png",
          "assets/icons/icon-192x192.png",
          "assets/icons/icon-512x512.png",

          // Self-hosted fonts & icons (ensure these files exist)
          "assets/vendor/fontawesome/css/all.min.css",
          "assets/vendor/fontawesome/webfonts/fa-solid-900.woff2",
          "assets/vendor/fontawesome/webfonts/fa-regular-400.woff2",
          "assets/vendor/fontawesome/webfonts/fa-brands-400.woff2",
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches
          .match("assets/offline.html")
          .then((res) => res || caches.match("index.html")),
      ),
    );
    return;
  }
  if (
    req.method === "GET" &&
    new URL(req.url).origin === self.location.origin
  ) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fetcher = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => hit);
        return hit || fetcher;
      }),
    );
  }
});
