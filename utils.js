"use strict";
window.App = window.App || {};
App.Utils = (() => {
  const DEBUG = !!(window.App && App.Config && App.Config.DEBUG);
  const log = (...a) => {
    if (DEBUG) console.log("[App]", ...a);
  };
  const safeParse = (s, fallback = null) => {
    if (s == null) return fallback;
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  };
  const onceFlags = new Set();
  const once = (key, fn) => {
    if (onceFlags.has(key)) return;
    onceFlags.add(key);
    fn();
  };
  const normalizeSetlistName = (name) =>
    name
      .replace(/\.[^/.]+$/, "")
      .replace(/[_\-]+/g, " ")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return { log, safeParse, once, normalizeSetlistName };
})();
