"use strict";
window.App = window.App || {};
App.Config = Object.assign(
  {
    APP_NAME: "Hill Rd Setlist Manager",
    VERSION: "1.0.0",
    DEBUG: true,
    SCHEMA_VERSION: 1,
    STORAGE: {
      SONGS: "hrsm:songs",
      SETLISTS: "hrsm:setlists",
      SETTINGS: "hrsm:settings",
      VERSION: "hrsm:version",
    },
    UI: { AUTOSCROLL_MIN_BPM: 20, AUTOSCROLL_MAX_BPM: 240 },
    INSTALL_PROMPT: {
      // 'session' (default), 'daily', 'weekly' — used only if developer opts in later
      frequency: 'session',
      dailyIntervalMs: 24 * 60 * 60 * 1000,
      weeklyIntervalMs: 7 * 24 * 60 * 60 * 1000,
      storageKeys: {
        lastShown: 'pwa:install:lastShown',
        installed: 'pwa:install:installed',
        // Session-scoped flags
        acceptedSession: 'pwa:install:accepted:session',
        dismissedSession: 'pwa:install:dismissed:session',
      }
    },
  },
  App.Config || {},
);
