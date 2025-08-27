"use strict";
window.App = window.App || {};
App.Utils = (() => {
  const DEBUG = !!(window.App && App.Config && App.Config.DEBUG);
  const log = (...args) => { if (DEBUG) console.log(...args); };
  const safeParse = (s, fallback=null) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };
  return { log, safeParse };
})();
