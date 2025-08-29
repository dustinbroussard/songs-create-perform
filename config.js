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
  },
  App.Config || {},
);
