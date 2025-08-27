"use strict";
window.App = window.App || {};
App.Utils = (() => {
  const DEBUG = !!(window.App && App.Config && App.Config.DEBUG);
  const log = (...a) => { if (DEBUG) console.log("[App]", ...a); };
  const safeParse = (s, fallback = null) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };
  // simple once() guard for idempotent init
  const onceFlags = new Set();
  const once = (key, fn) => { if (onceFlags.has(key)) return; onceFlags.add(key); fn(); };
  return { log, safeParse, once };
})();
