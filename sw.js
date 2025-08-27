"use strict";
const CACHE_VERSION = "v11"; // bump on SW-relevant changes
const STATIC_CACHE = `hrsm-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `hrsm-runtime-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/editor/editor.html",
  "/performance/performance.html",
  "/style.css",
  "/editor/editor.css",
  "/performance/performance.css",
  "/script.js",
  "/editor/editor.js",
  "/performance/performance.js",
  "/core/song-core.js",
  "/editor/songs.js",
  "/config.js",
  "/manifest.json",
  "/assets/offline.html",
  "/assets/favicon.svg",
];
// install: pre-cache app shell
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});
// activate: clean old caches + claim
self.addEventListener("activate", (e) => {
  e.waitUntil(
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
// fetch handler
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/assets/offline.html")),
    );
    return;
  }
  if (STATIC_ASSETS.includes(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }
  if (req.url.endsWith(".json")) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => caches.match("/assets/offline.html"));
      }),
    );
    return;
  }
  e.respondWith(
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
});
