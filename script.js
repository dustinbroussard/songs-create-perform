"use strict";
window.App = window.App || {};
App.Store = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* no-op */
    }
  },
  migrate() {
    const v = App.Store.get(App.Config.STORAGE.VERSION, "0");
    if (v !== App.Config.VERSION) {
      App.Store.set(App.Config.STORAGE.VERSION, App.Config.VERSION);
    }
  },
};
document.addEventListener("DOMContentLoaded", () => App.Store.migrate(), {
  once: true,
});

// ==== THEME HANDLING ====
document.addEventListener("DOMContentLoaded", function () {
  // Initialize theme
  const savedTheme = localStorage.getItem("theme");
  if (!savedTheme) {
    localStorage.setItem("theme", "dark");
    document.documentElement.dataset.theme = "dark";
  } else {
    document.documentElement.dataset.theme = savedTheme;
  }
});

// ---- Lazy-loaded Editor integration ----
let editorLoaded = false;
function ensureEditorLoaded(openOverlay = false, initialSongId = null) {
  if (editorLoaded) {
    if (openOverlay) openEditor(initialSongId);
    return;
  }
  const s = document.createElement("script");
  s.src = "editor.js";
  s.onload = () => {
    editorLoaded = true;
    window.Editor?.init?.({
      core: window.SongCore,
      getSongs: () => JSON.parse(localStorage.getItem("songs") || "[]"),
      setSongs: (songs) =>
        localStorage.setItem("songs", JSON.stringify(songs || [])),
      onSongSaved: (song) => {
        if (typeof window.app?.renderSongs === "function")
          window.app.renderSongs();
      },
    });
    if (openOverlay) openEditor(initialSongId);
  };
  document.head.appendChild(s);
}

function openEditor(songId = null) {
  const host = document.getElementById("editor-overlay");
  const modal = document.getElementById("editor-mode");
  modal.style.display = "flex";
  window.Editor?.open?.({
    container: host,
    songId,
  });

  const esc = (e) => {
    if (e.key === "Escape") {
      closeEditor();
    }
  };
  document.addEventListener("keydown", esc, { once: true });
  modal.addEventListener(
    "click",
    (e) => {
      if (e.target === modal) closeEditor();
    },
    { once: true },
  );
}

function closeEditor() {
  const modal = document.getElementById("editor-mode");
  modal.style.display = "none";
  window.Editor?.teardown?.();
}

// ==== SETLIST MANAGER MODULE
function normalizeSetlistName(name) {
  return name
    .replace(/\.[^/.]+$/, "") // Remove file extension
    .replace(/[_\-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SetlistsManager = (() => {
  let setlists = new Map();
  const DB_KEY = "setlists";

  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        setlists = new Map(arr.map((obj) => [obj.id, obj]));
      }
    } catch (error) {
      setlists = new Map();
    }
  }

  function save() {
    localStorage.setItem(DB_KEY, JSON.stringify(Array.from(setlists.values())));
  }

  function getAllSetlists() {
    return Array.from(setlists.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  function getSetlistById(id) {
    return setlists.get(id) || null;
  }

  function addSetlist(name, songIds = []) {
    const normalized = normalizeSetlistName(name);
    const existing = Array.from(setlists.values()).find(
      (s) => s.name.toLowerCase() === normalized.toLowerCase(),
    );
    let finalName = normalized;
    if (existing) {
      let counter = 1;
      while (
        Array.from(setlists.values()).find(
          (s) =>
            s.name.toLowerCase() === `${normalized} (${counter})`.toLowerCase(),
        )
      ) {
        counter++;
      }
      finalName = `${normalized} (${counter})`;
    }
    const setlist = {
      id: Date.now().toString() + Math.random().toString(16).slice(2),
      name: finalName,
      songs: [...songIds],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setlists.set(setlist.id, setlist);
    save();
    return setlist;
  }

  function renameSetlist(id, newName) {
    const setlist = setlists.get(id);
    if (setlist) {
      const normalized = normalizeSetlistName(newName);
      const existing = Array.from(setlists.values()).find(
        (s) => s.id !== id && s.name.toLowerCase() === normalized.toLowerCase(),
      );
      if (existing)
        throw new Error(`A setlist named "${normalized}" already exists`);
      setlist.name = newName.trim();
      setlist.updatedAt = Date.now();
      save();
      return setlist;
    }
    return null;
  }

  function duplicateSetlist(id) {
    const orig = getSetlistById(id);
    if (orig) return addSetlist(orig.name + " Copy", orig.songs);
    return null;
  }

  function deleteSetlist(id) {
    const deleted = setlists.delete(id);
    if (deleted) save();
    return deleted;
  }

  function updateSetlistSongs(id, songIds) {
    const setlist = setlists.get(id);
    if (setlist) {
      setlist.songs = [...songIds];
      setlist.updatedAt = Date.now();
      save();
      return setlist;
    }
    return null;
  }

  function addSongToSetlist(setlistId, songId) {
    const setlist = setlists.get(setlistId);
    if (setlist && !setlist.songs.includes(songId)) {
      setlist.songs.push(songId);
      setlist.updatedAt = Date.now();
      save();
      return setlist;
    }
    return null;
  }

  function removeSongFromSetlist(setlistId, songId) {
    const setlist = setlists.get(setlistId);
    if (setlist) {
      const index = setlist.songs.indexOf(songId);
      if (index > -1) {
        setlist.songs.splice(index, 1);
        setlist.updatedAt = Date.now();
        save();
        return setlist;
      }
    }
    return null;
  }

  function moveSongInSetlist(setlistId, songId, direction) {
    const setlist = setlists.get(setlistId);
    if (!setlist) return null;
    const currentIndex = setlist.songs.indexOf(songId);
    if (currentIndex === -1) return null;
    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= setlist.songs.length) return null;
    [setlist.songs[currentIndex], setlist.songs[newIndex]] = [
      setlist.songs[newIndex],
      setlist.songs[currentIndex],
    ];
    setlist.updatedAt = Date.now();
    save();
    return setlist;
  }

  function importSetlistFromText(name, text, allSongs) {
    // Normalize and trim setlist name
    const normalizedName = name.trim();
    if (!normalizedName) {
      alert("Setlist name cannot be empty.");
      return null;
    }

    // Use Fuse for fuzzy matching
    const fuse = new Fuse(allSongs, {
      keys: ["title"],
      threshold: 0.4,
      includeScore: true,
    });

    // Split text into lines and clean up
    const titles = text
      .split("\n")
      .map((line) => line.trim().replace(/^\d+[\).\:\-]?\s*/, "")) // Strip "1.", "2)", etc.
      .filter((line) => line.length > 0);

    const songIds = [];
    const notFound = [];

    titles.forEach((title) => {
      const results = fuse.search(title);
      if (results.length && results[0].score <= 0.5) {
        songIds.push(results[0].item.id);
      } else {
        notFound.push(title);
      }
    });

    if (songIds.length === 0) {
      alert("No matching songs found to import.");
      return null;
    }

    // Add setlist with fuzzy matched songs
    let setlist;
    try {
      setlist = SetlistsManager.addSetlist(normalizedName, songIds);
    } catch (err) {
      alert(err.message || "Failed to create setlist.");
      return null;
    }

    // Notify user of any missing songs
    if (notFound.length > 0) {
      alert(
        `The following songs were not found and were not imported:\n- ${notFound.join("\n- ")}`,
      );
    }

    return { setlist, imported: songIds.length, notFound };
  }

  function exportSetlist(setlistId, allSongs, format = "json") {
    const setlist = getSetlistById(setlistId);
    if (!setlist) return null;
    const songs = setlist.songs
      .map((songId) => allSongs.find((s) => s.id === songId))
      .filter((song) => song !== undefined);
    switch (format) {
      case "json":
        return JSON.stringify({ setlist, songs }, null, 2);
      case "txt":
        return songs.map((song) => song.title).join("\n");
      case "csv":
        const header = "Title,Lyrics\n";
        const rows = songs
          .map(
            (song) =>
              `"${song.title.replace(/"/g, '""')}","${song.lyrics.replace(/"/g, '""')}"`,
          )
          .join("\n");
        return header + rows;
      default:
        return null;
    }
  }

  load();

  return {
    getAllSetlists,
    getSetlistById,
    addSetlist,
    renameSetlist,
    duplicateSetlist,
    deleteSetlist,
    updateSetlistSongs,
    addSongToSetlist,
    removeSongFromSetlist,
    moveSongInSetlist,
    importSetlistFromText,
    exportSetlist,
    load,
    save,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  const app = {
    normalizeTitle(title) {
      let t = title.replace(/\.[^/.]+$/, "");
      t = t.replace(/[_\-]+/g, " ");
      t = t.replace(/\s+/g, " ").trim();
      t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
      t = t.replace(
        /\w\S*/g,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
      );
      return t;
    },

    isDuplicateTitle(title) {
      const normalized = title.trim().toLowerCase();
      return this.songs.some(
        (song) => song.title.trim().toLowerCase() === normalized,
      );
    },

    // DOM Elements
    navButtons: document.querySelectorAll(".nav-button"),
    tabs: document.querySelectorAll(".tab"),
    songList: document.getElementById("song-list"),
    addSongBtn: document.getElementById("add-song-btn"),
    deleteAllSongsBtn: document.getElementById("delete-all-songs-btn"),
    songModal: document.getElementById("song-modal"),
    songModalTitle: document.getElementById("song-modal-title"),
    saveSongBtn: document.getElementById("save-song-btn"),
    cancelSongBtn: document.getElementById("cancel-song-btn"),
    songTitleInput: document.getElementById("song-title-input"),
    songLyricsInput: document.getElementById("song-lyrics-input"),
    songSearchInput: document.getElementById("song-search-input"),
    songUploadInput: document.getElementById("song-upload-input"),
    setlistSelect: document.getElementById("setlist-select"),
    newSetlistBtn: document.getElementById("new-setlist-btn"),
    renameSetlistBtn: document.getElementById("rename-setlist-btn"),
    duplicateSetlistBtn: document.getElementById("duplicate-setlist-btn"),
    deleteSetlistBtn: document.getElementById("delete-setlist-btn"),
    availableSongsContainer: document.getElementById("available-songs"),
    currentSetlistSongsContainer: document.getElementById(
      "current-setlist-songs",
    ),
    currentSetlistTitle: document.getElementById("current-setlist-title"),
    setlistModal: document.getElementById("setlist-modal"),
    setlistModalTitle: document.getElementById("setlist-modal-title"),
    setlistNameInput: document.getElementById("setlist-name-input"),
    saveSetlistBtn: document.getElementById("save-setlist-btn"),
    cancelSetlistBtn: document.getElementById("cancel-setlist-btn"),
    performanceSetlistSelect: document.getElementById(
      "performance-setlist-select",
    ),
    performanceSongSearch: document.getElementById("performance-song-search"),
    startPerformanceBtn: document.getElementById("start-performance-btn"),
    performanceSongList: document.getElementById("performance-song-list"),
    editorSongList: document.getElementById("editor-song-list"),

    // Tab Toolbars
    tabToolbars: {
      songs: `
                <input type="text" id="song-search-input" class="search-input" placeholder="Search songs...">
                <div class="toolbar-buttons-group">
                    <button id="add-song-btn" class="btn"><i class="fas fa-plus"></i></button>
                    <button id="delete-all-songs-btn" class="btn danger"><i class="fas fa-trash"></i></button>
                    <label for="song-upload-input" class="btn"><i class="fas fa-upload"></i></label>
                </div>
                <input type="file" id="song-upload-input" multiple accept=".txt,.docx" class="hidden-file">
            `,
      setlists: `
                <select id="setlist-select" class="setlist-select"></select>
                <div class="toolbar-buttons-group">
                    <button id="new-setlist-btn" class="btn" title="New Setlist"><i class="fas fa-plus"></i></button>
                    <button id="rename-setlist-btn" class="btn" title="Rename"><i class="fas fa-pen"></i></button>
                    <button id="duplicate-setlist-btn" class="btn" title="Duplicate"><i class="fas fa-copy"></i></button>
                    <button id="delete-setlist-btn" class="btn danger" title="Delete"><i class="fas fa-trash"></i></button>
                    <button id="import-setlist-btn" class="btn" title="Import"><i class="fas fa-file-import"></i></button>
                    <button id="export-setlist-btn" class="btn" title="Export"><i class="fas fa-file-export"></i></button>
                </div>
                <input type="file" id="import-setlist-file" accept=".txt,.docx" class="hidden-file">
            `,
      performance: `
                <select id="performance-setlist-select" class="setlist-select"></select>
                <input type="text" id="performance-song-search" class="search-input" placeholder="Find any song...">
                <button id="start-performance-btn" class="btn primary"><i class="fas fa-play"></i> Start</button>
            `,
      editor: `
                <button id="new-song-in-editor" class="btn"><i class="fas fa-plus"></i> New</button>
                <button id="open-selected-in-editor" class="btn"><i class="fas fa-pen"></i> Edit Selected</button>
            `,
    },

    // State
    songs: [],
    currentSongId: null,
    currentSetlistId: null,
    performanceSetlistId: null,
    modalMode: null,
    sortableSetlist: null,
    lastPerformance: null,

    // Render the toolbar for the given tab and attach event listeners
    renderToolbar(tab) {
      const toolbarDiv = document.getElementById("tab-toolbar");
      if (!toolbarDiv) {
        console.error("Tab toolbar element not found");
        return;
      }
      toolbarDiv.innerHTML = this.tabToolbars[tab] || "";

      if (tab === "setlists" || tab === "performance") {
        this.setlistSelect = document.getElementById("setlist-select");
        this.performanceSetlistSelect = document.getElementById(
          "performance-setlist-select",
        );
      }

      if (tab === "songs") {
        this.songSearchInput = document.getElementById("song-search-input");
        this.addSongBtn = document.getElementById("add-song-btn");
        this.deleteAllSongsBtn = document.getElementById(
          "delete-all-songs-btn",
        );
        this.songUploadInput = document.getElementById("song-upload-input");

        this.songSearchInput.addEventListener("input", () =>
          this.renderSongs(),
        );
        this.addSongBtn.addEventListener("click", () => this.openSongModal());
        this.deleteAllSongsBtn.addEventListener("click", () => {
          if (confirm("Delete ALL songs? This cannot be undone!")) {
            this.songs = [];
            this.saveData();
            this.renderSongs();
          }
        });
        this.songUploadInput.addEventListener("change", (e) =>
          this.handleFileUpload(e),
        );
      } else if (tab === "setlists") {
        this.setlistSelect = document.getElementById("setlist-select");
        this.newSetlistBtn = document.getElementById("new-setlist-btn");
        this.renameSetlistBtn = document.getElementById("rename-setlist-btn");
        this.duplicateSetlistBtn = document.getElementById(
          "duplicate-setlist-btn",
        );
        this.deleteSetlistBtn = document.getElementById("delete-setlist-btn");
        this.setlistSelect.addEventListener("change", (e) =>
          this.handleSetlistSelectChange(e),
        );
        this.newSetlistBtn.addEventListener("click", () =>
          this.openSetlistModal(),
        );
        this.renameSetlistBtn.addEventListener("click", () =>
          this.openSetlistModal("rename"),
        );
        this.duplicateSetlistBtn.addEventListener("click", () =>
          this.handleDuplicateSetlist(),
        );
        this.deleteSetlistBtn.addEventListener("click", () =>
          this.handleDeleteSetlist(),
        );
        document
          .getElementById("import-setlist-btn")
          .addEventListener("click", () => {
            document.getElementById("import-setlist-file").click();
          });
        document
          .getElementById("export-setlist-btn")
          .addEventListener("click", () => {
            if (!this.currentSetlistId) {
              alert("No setlist selected!");
              return;
            }
            const format = prompt("Export format? (json/txt/csv)", "json");
            if (!format) return;
            const content = SetlistsManager.exportSetlist(
              this.currentSetlistId,
              this.songs,
              format.trim().toLowerCase(),
            );
            if (content) {
              let ext =
                format === "csv" ? "csv" : format === "txt" ? "txt" : "json";
              const setlist = SetlistsManager.getSetlistById(
                this.currentSetlistId,
              );
              const name = setlist
                ? setlist.name.replace(/\s+/g, "_")
                : "setlist";
              this.downloadFile(
                `${name}.${ext}`,
                content,
                ext === "json"
                  ? "application/json"
                  : ext === "csv"
                    ? "text/csv"
                    : "text/plain",
              );
            } else {
              alert("Export failed.");
            }
          });
        document
          .getElementById("import-setlist-file")
          .addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
              let text = event.target.result;
              let setlistName = prompt(
                "Setlist name?",
                file.name.replace(/\.[^/.]+$/, ""),
              );
              if (!setlistName) return;
              if (file.name.endsWith(".docx")) {
                mammoth
                  .extractRawText({ arrayBuffer: event.target.result })
                  .then((result) => {
                    text = result.value;
                    finishImportSetlist(setlistName, text);
                  });
              } else {
                finishImportSetlist(setlistName, text);
              }
            };
            if (file.name.endsWith(".docx")) {
              reader.readAsArrayBuffer(file);
            } else {
              reader.readAsText(file);
            }
            e.target.value = "";
          });
      } else if (tab === "performance") {
        this.performanceSetlistSelect = document.getElementById(
          "performance-setlist-select",
        );
        this.performanceSongSearch = document.getElementById(
          "performance-song-search",
        );
        this.startPerformanceBtn = document.getElementById(
          "start-performance-btn",
        );
        this.performanceSetlistSelect.addEventListener("change", () =>
          this.handlePerformanceSetlistChange(),
        );
        this.performanceSongSearch.addEventListener("input", () =>
          this.handlePerformanceSongSearch(),
        );
        this.startPerformanceBtn.addEventListener("click", () =>
          this.handleStartPerformance(),
        );
      } else if (tab === "editor") {
        this.editorNewBtn = document.getElementById("new-song-in-editor");
        this.editorOpenBtn = document.getElementById(
          "open-selected-in-editor",
        );
        this.editorNewBtn.addEventListener("click", () => {
          window.location.href = "editor/editor.html?new=1";
        });
        this.editorOpenBtn.addEventListener("click", () => {
          if (this.currentSongId) {
            window.location.href = `editor/editor.html?songId=${this.currentSongId}`;
          } else {
            alert("Please select a song to edit.");
          }
        });
      }
    },

    // Core App Initialization
    init() {
      this.loadData();
      this.renderToolbar("songs");
      this.setlistSelect = document.getElementById("setlist-select");
      this.performanceSetlistSelect = document.getElementById(
        "performance-setlist-select",
      );
      this.setupEventListeners();
      this.renderSongs();
      if (this.setlistSelect && this.performanceSetlistSelect) {
        this.renderSetlists();
      }
    },

    // Data Management
    loadData() {
      this.songs = JSON.parse(localStorage.getItem("songs")) || [];
      const theme = localStorage.getItem("theme") || "dark";
      document.documentElement.dataset.theme = theme;
    },

    saveData() {
      localStorage.setItem("songs", JSON.stringify(this.songs));
    },

    // Lyrics Management
    getAllLyrics() {
      return this.songs;
    },

    getLyricById(id) {
      return this.songs.find((song) => song.id === id);
    },

    addLyric(song) {
      this.songs.push(song);
      this.saveData();
    },

    removeLyric(id) {
      this.songs = this.songs.filter((song) => song.id !== id);
      this.saveData();
    },

    searchLyrics(query) {
      query = query.trim().toLowerCase();
      return this.songs.filter(
        (song) =>
          song.title.toLowerCase().includes(query) ||
          (song.lyrics && song.lyrics.toLowerCase().includes(query)),
      );
    },

    renameLyric(id, newTitle) {
      const song = this.getLyricById(id);
      if (song) {
        song.title = newTitle;
        this.saveData();
      }
    },

    editLyric(id, newLyrics) {
      const song = this.getLyricById(id);
      if (song) {
        song.lyrics = newLyrics;
        this.saveData();
      }
    },

    // Event Listeners

    setupEventListeners() {
      this.navButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          this.tabs.forEach((tab) => tab.classList.remove("active"));
          this.navButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const tabName = btn.getAttribute("data-tab");
          document.getElementById(tabName).classList.add("active");
          this.renderToolbar(tabName);
          if (tabName === "songs") this.renderSongs();
          if (tabName === "setlists") this.renderSetlists();
          if (tabName === "performance") this.renderPerformanceTab();
          if (tabName === "editor") this.renderEditorTab();
        });
      });

      this.saveSongBtn.onclick = () => this.saveSong();
      this.cancelSongBtn.onclick = () => this.closeSongModal();
      this.saveSetlistBtn.addEventListener("click", () => this.saveSetlist());
      this.cancelSetlistBtn.addEventListener("click", () =>
        this.closeSetlistModal(),
      );
      this.availableSongsContainer.addEventListener("click", (e) =>
        this.handleAvailableSongsClick(e),
      );
      this.currentSetlistSongsContainer.addEventListener("click", (e) =>
        this.handleCurrentSetlistSongsClick(e),
      );
      this.performanceSongList.addEventListener("click", (e) =>
        this.handlePerformanceSongClick(e),
      );
      this.editorSongList.addEventListener("click", (e) => {
        const item = e.target.closest(".song-item");
        if (item) {
          this.currentSongId = item.dataset.id;
          this.editorSongList
            .querySelectorAll(".song-item")
            .forEach((el) => el.classList.remove("selected"));
          item.classList.add("selected");
        }
      });
      this.editorSongList.addEventListener("dblclick", (e) => {
        const item = e.target.closest(".song-item");
        if (item) {
          window.location.href = `editor/editor.html?songId=${item.dataset.id}`;
        }
      });
      this.songList.addEventListener("click", (e) => {
        const item = e.target.closest(".song-item");
        if (item) this.currentSongId = item.dataset.id;
      });
      // Add theme toggle button handler
      document
        .getElementById("theme-toggle-btn")
        ?.addEventListener("click", () => {
          const currentTheme = document.documentElement.dataset.theme;
          const isDark = currentTheme.includes("dark");
          const newTheme = isDark
            ? currentTheme.replace("dark", "light")
            : currentTheme.replace("light", "dark");
          document.documentElement.dataset.theme = newTheme;
          localStorage.setItem("theme", newTheme);
        });
    },

    // Song UI and Actions
    renderSongs() {
      const query = this.songSearchInput.value.toLowerCase();
      const filteredSongs = this.searchLyrics(query).sort((a, b) =>
        a.title.localeCompare(b.title),
      );
      this.songList.innerHTML = filteredSongs
        .map(
          (song) => `
                <div class="song-item" data-id="${song.id}">
                    <span>${song.title}</span>
                    <div class="song-actions">
                        <button class="btn edit-song-btn"><i class="fas fa-pen"></i></button>
                        <button class="btn danger delete-song-btn"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `,
        )
        .join("");

      document.querySelectorAll(".edit-song-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const id = e.target.closest(".song-item").dataset.id;
          this.currentSongId = id;
          ensureEditorLoaded(true, id);
        });
      });

      document.querySelectorAll(".delete-song-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const id = e.target.closest(".song-item").dataset.id;
          this.deleteSong(id);
        });
      });
    },

    openSongModal(id = null) {
      this.currentSongId = id;
      if (id) {
        const song = this.getLyricById(id);
        this.songModalTitle.textContent = "Edit Song";
        this.songTitleInput.value = song.title;
        this.songLyricsInput.value = song.lyrics;
      } else {
        this.songModalTitle.textContent = "Add Song";
        this.songTitleInput.value = "";
        this.songLyricsInput.value = "";
      }
      // enable/disable Save
      const validate = () => {
        const t = this.normalizeTitle(this.songTitleInput.value.trim());
        const isGeneric = /^(new song|untitled|new|song)$/i.test(t);
        this.saveSongBtn.disabled = !t || isGeneric;
      };
      this.songTitleInput.removeEventListener("_validate", validate); // no-op label to avoid duplicates
      this.songTitleInput.addEventListener("input", validate);
      validate();

      this.songModal.style.display = "block";
    },

    closeSongModal() {
      this.songModal.style.display = "none";
    },

    saveSong() {
      const rawTitle = this.songTitleInput.value.trim();
      const title = this.normalizeTitle(rawTitle);
      const lyrics = (this.songLyricsInput.value || "").trim();

      // Treat placeholder/generic titles as invalid if lyrics are empty
      const isGenericTitle = /^(new song|untitled|new|song)$/i.test(title);

      if (!title || (isGenericTitle && lyrics.length === 0)) {
        alert(
          'Please enter a real song title (not "New Song"/"Untitled") and/or add some lyrics.',
        );
        return;
      }

      if (this.currentSongId) {
        const song = this.songs.find((s) => s.id === this.currentSongId);
        if (song) {
          song.title = title;
          song.lyrics = lyrics;
        }
      } else {
        if (this.isDuplicateTitle(title)) {
          alert("A song with that title already exists.");
          this.closeSongModal();
          return;
        }
        this.songs.push({
          id: Date.now().toString(),
          title,
          lyrics,
        });
      }
      this.saveData();
      this.renderSongs();
      this.closeSongModal();
    },

    deleteSong(id) {
      if (confirm("Are you sure you want to delete this song?")) {
        this.removeLyric(id);
        SetlistsManager.getAllSetlists().forEach((s) => {
          SetlistsManager.removeSongFromSetlist(s.id, id);
        });
        this.renderSongs();
        this.renderSetlists();
      }
    },

    handleFileUpload(event) {
      const files = event.target.files;
      const MIN_USEFUL_LEN = 3; // tweak if you want

      for (const file of files) {
        const pushIfValid = (proposedTitle, rawLyrics) => {
          const title = this.normalizeTitle(proposedTitle || "");
          const lyrics = (rawLyrics || "").toString().trim();

          const isGenericTitle = /^(new song|untitled|new|song)$/i.test(title);
          const looksEmpty = lyrics.replace(/\s+/g, "").length < MIN_USEFUL_LEN;

          // Skip junky uploads
          if (!title || (isGenericTitle && looksEmpty)) return;
          if (this.isDuplicateTitle(title)) return;

          this.songs.push({ id: Date.now().toString(), title, lyrics });
          this.saveData();
          this.renderSongs();
        };

        const reader = new FileReader();
        if (file.name.endsWith(".docx")) {
          reader.onload = (e) => {
            mammoth
              .extractRawText({ arrayBuffer: e.target.result })
              .then((result) => {
                pushIfValid(file.name, result.value);
              });
          };
          reader.readAsArrayBuffer(file);
        } else {
          reader.onload = (e) => {
            pushIfValid(file.name, e.target.result);
          };
          reader.readAsText(file);
        }
      }
      // optional: clear input
      event.target.value = "";
    },

    // Setlist Management
    renderSetlists() {
      const setlists = SetlistsManager.getAllSetlists();
      if (this.setlistSelect) {
        this.setlistSelect.innerHTML =
          '<option value="">Select a setlist...</option>';
      }
      if (this.performanceSetlistSelect) {
        this.performanceSetlistSelect.innerHTML =
          '<option value="">All Songs</option>';
      }

      setlists.forEach((s) => {
        if (this.setlistSelect) {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.name;
          this.setlistSelect.appendChild(opt);
        }
        if (this.performanceSetlistSelect) {
          const perfOpt = document.createElement("option");
          perfOpt.value = s.id;
          perfOpt.textContent = s.name;
          this.performanceSetlistSelect.appendChild(perfOpt);
        }
      });

      if (setlists.length && this.currentSetlistId) {
        if (this.setlistSelect)
          this.setlistSelect.value = this.currentSetlistId;
        this.renderSetlistSongs();
      } else if (setlists.length > 0) {
        this.currentSetlistId = setlists[0].id;
        if (this.setlistSelect)
          this.setlistSelect.value = this.currentSetlistId;
        this.renderSetlistSongs();
      } else {
        this.currentSetlistId = null;
        this.availableSongsContainer.innerHTML = "<p>No songs available</p>";
        this.currentSetlistSongsContainer.innerHTML =
          "<p>No setlist selected</p>";
        this.currentSetlistTitle.textContent = "Current Setlist";
      }
    },

    renderSetlistSongs() {
      const setlist = SetlistsManager.getSetlistById(this.currentSetlistId);
      const allSongs = this.songs;

      if (!setlist) {
        this.availableSongsContainer.innerHTML = "<p>No setlist selected</p>";
        this.currentSetlistSongsContainer.innerHTML =
          "<p>No setlist selected</p>";
        return;
      }

      const availableSongs = allSongs
        .filter((s) => !setlist.songs.includes(s.id))
        .sort((a, b) => a.title.localeCompare(b.title));
      this.availableSongsContainer.innerHTML =
        availableSongs.length > 0
          ? availableSongs
              .map(
                (s) =>
                  `<div class="song-item" data-id="${s.id}">
                        <span>${s.title}</span>
                        <button class="btn add-to-setlist-btn" title="Add to Setlist"><i class="fas fa-arrow-right"></i></button>
                    </div>`,
              )
              .join("")
          : "<p>All songs are in this setlist</p>";

      const setlistSongs = setlist.songs
        .map((id) => allSongs.find((s) => s.id === id))
        .filter(Boolean);
      this.currentSetlistSongsContainer.innerHTML =
        setlistSongs.length > 0
          ? setlistSongs
              .map(
                (s) =>
                  `<div class="song-item sortable-setlist-song" data-id="${s.id}">
                        <span class="drag-handle" title="Drag to reorder" style="cursor:grab;"><i class="fas fa-grip-vertical"></i></span>
                        <span class="song-title">${s.title}</span>
                        <div>
                            <button class="btn move-up-btn" title="Move Up"><i class="fas fa-arrow-up"></i></button>
                            <button class="btn move-down-btn" title="Move Down"><i class="fas fa-arrow-down"></i></button>
                            <button class="btn remove-from-setlist-btn" title="Remove from Setlist"><i class="fas fa-times"></i></button>
                        </div>
                    </div>`,
              )
              .join("")
          : "<p>No songs in this setlist</p>";

      if (this.sortableSetlist) {
        this.sortableSetlist.destroy();
      }
      this.sortableSetlist = Sortable.create(
        this.currentSetlistSongsContainer,
        {
          animation: 150,
          handle: ".drag-handle",
          ghostClass: "drag-ghost",
          delay: 0,
          touchStartThreshold: 2,
          onEnd: (evt) => {
            const newOrder = Array.from(
              this.currentSetlistSongsContainer.querySelectorAll(".song-item"),
            ).map((item) => item.dataset.id);
            SetlistsManager.updateSetlistSongs(this.currentSetlistId, newOrder);
            this.renderSetlistSongs();
          },
        },
      );
    },

    openSetlistModal(mode = "add") {
      this.modalMode = mode;
      if (mode === "rename" && this.currentSetlistId) {
        const setlist = SetlistsManager.getSetlistById(this.currentSetlistId);
        this.setlistModalTitle.textContent = "Rename Setlist";
        this.setlistNameInput.value = setlist?.name || "";
      } else {
        this.setlistModalTitle.textContent = "New Setlist";
        this.setlistNameInput.value = "";
      }
      this.setlistModal.style.display = "block";
      this.setlistNameInput.focus();
    },

    closeSetlistModal() {
      this.setlistModal.style.display = "none";
      this.modalMode = null;
    },

    saveSetlist() {
      const name = this.setlistNameInput.value.trim();
      if (!name) {
        alert("Please enter a setlist name");
        return;
      }

      try {
        if (this.modalMode === "rename" && this.currentSetlistId) {
          SetlistsManager.renameSetlist(this.currentSetlistId, name);
        } else {
          const setlist = SetlistsManager.addSetlist(name, []);
          this.currentSetlistId = setlist.id;
        }
      } catch (err) {
        alert(err.message || "Could not save setlist.");
        return;
      }
      this.renderSetlists();
      this.closeSetlistModal();
    },

    handleDuplicateSetlist() {
      if (!this.currentSetlistId) return;
      const newSetlist = SetlistsManager.duplicateSetlist(
        this.currentSetlistId,
      );
      if (newSetlist) {
        this.currentSetlistId = newSetlist.id;
        this.renderSetlists();
      }
    },

    handleDeleteSetlist() {
      if (!this.currentSetlistId) return;
      if (confirm("Delete this setlist?")) {
        SetlistsManager.deleteSetlist(this.currentSetlistId);
        this.currentSetlistId = null;
        this.renderSetlists();
      }
    },

    handleSetlistSelectChange(e) {
      this.currentSetlistId = e.target.value || null;
      this.renderSetlistSongs();
    },

    handleAvailableSongsClick(e) {
      if (!e.target.closest(".add-to-setlist-btn")) return;
      const songItem = e.target.closest(".song-item");
      if (!songItem || !this.currentSetlistId) return;
      const id = songItem.dataset.id;
      SetlistsManager.addSongToSetlist(this.currentSetlistId, id);
      this.renderSetlistSongs();
    },

    handleCurrentSetlistSongsClick(e) {
      const songItem = e.target.closest(".song-item");
      if (!songItem || !this.currentSetlistId) return;
      const id = songItem.dataset.id;
      if (e.target.closest(".remove-from-setlist-btn")) {
        SetlistsManager.removeSongFromSetlist(this.currentSetlistId, id);
        this.renderSetlistSongs();
      } else if (e.target.closest(".move-up-btn")) {
        SetlistsManager.moveSongInSetlist(this.currentSetlistId, id, -1);
        this.renderSetlistSongs();
      } else if (e.target.closest(".move-down-btn")) {
        SetlistsManager.moveSongInSetlist(this.currentSetlistId, id, 1);
        this.renderSetlistSongs();
      }
    },

    // Performance Mode
    renderPerformanceTab() {
      this.renderSetlists();
      this.handlePerformanceSetlistChange();
    },

    handlePerformanceSetlistChange() {
      this.performanceSetlistId = this.performanceSetlistSelect.value || null;
      this.renderPerformanceSongList();
    },

    handlePerformanceSongSearch() {
      this.renderPerformanceSongList();
    },

    renderPerformanceSongList() {
      let songs = [];
      const query = this.performanceSongSearch.value.trim();

      if (this.performanceSetlistId) {
        const setlist = SetlistsManager.getSetlistById(
          this.performanceSetlistId,
        );
        if (setlist) {
          songs = setlist.songs
            .map((id) => this.songs.find((s) => s.id === id))
            .filter(Boolean);
        }
      } else {
        songs = this.songs;
      }

      if (query) {
        songs = songs.filter(
          (song) =>
            song.title.toLowerCase().includes(query.toLowerCase()) ||
            song.lyrics.toLowerCase().includes(query.toLowerCase()),
        );
      }

      this.performanceSongList.innerHTML = songs
        .map(
          (song) => `
                <div class="song-item" data-id="${song.id}">
                    <span>${song.title}</span>
                    <button class="btn primary perform-song-btn" title="Perform This Song"><i class="fas fa-play"></i></button>
                </div>
            `,
        )
        .join("");
    },

    renderEditorTab() {
      const songs = [...this.songs].sort((a, b) =>
        a.title.localeCompare(b.title),
      );
      this.editorSongList.innerHTML = songs
        .map(
          (s) => `
                <div class="song-item" data-id="${s.id}">
                    <span>${s.title}</span>
                </div>
            `,
        )
        .join("");
      this.currentSongId = null;
    },

    handlePerformanceSongClick(e) {
      if (!e.target.closest(".perform-song-btn")) return;
      const songItem = e.target.closest(".song-item");
      if (!songItem) return;
      const songId = songItem.dataset.id;
      this.startPerformanceWithSong(songId);
    },

    handleStartPerformance() {
      if (this.performanceSetlistId) {
        const setlist = SetlistsManager.getSetlistById(
          this.performanceSetlistId,
        );
        if (setlist && setlist.songs.length > 0) {
          this.startPerformanceWithSong(setlist.songs[0]);
        } else {
          alert("No songs in selected setlist");
        }
      } else {
        if (this.songs.length > 0) {
          this.startPerformanceWithSong(this.songs[0].id);
        } else {
          alert("No songs available");
        }
      }
    },

    startPerformanceWithSong(songId) {
      const params = new URLSearchParams();
      if (this.performanceSetlistId) {
        params.set("setlistId", this.performanceSetlistId);
      }
      params.set("songId", songId);
      window.location.href = `performance/performance.html?${params.toString()}`;
    },

    // Helper for downloading a file
    downloadFile(filename, content, mime = "text/plain") {
      const blob = new Blob([content], { type: mime });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
        document.body.removeChild(link);
      }, 150);
    },
  };

  window.app = app;
  app.init();

  function finishImportSetlist(name, text) {
    const result = SetlistsManager.importSetlistFromText(name, text, app.songs);
    if (result) {
      app.currentSetlistId = result.setlist.id;
      app.renderSetlists();
      alert(
        `Imported: ${result.imported} songs.\nNot found: ${result.notFound.length ? result.notFound.join(", ") : "None"}`,
      );
    } else {
      alert("Import failed.");
    }
  }
});
