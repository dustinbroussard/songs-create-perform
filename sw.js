"use strict";
const CACHE_VERSION = "v11"; // bump on SW-related changes
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll([
          "/",
          "/index.html",
          "/editor/editor.html",
          "/performance/performance.html",
          "/style.css",
          "/editor/editor.css",
          "/performance/performance.css",
          "/config.js",
          "/utils.js",
          "/script.js",
          "/editor/editor.js",
          "/performance/performance.js",
          "/core/song-core.js",
          "/editor/songs.js",
        ])
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
      fetch(req).catch(() => caches.match("/index.html")),
    );
    return;
  }
  if (req.method === "GET" && new URL(req.url).origin === self.location.origin) {
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
