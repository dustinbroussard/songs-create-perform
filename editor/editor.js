document.addEventListener("DOMContentLoaded", () => {
  const { once, safeParse } = App.Utils || {};
  once && once("editor-init", () => {
    // Ensure touch devices trigger button actions
    document.addEventListener(
      "touchstart",
      (e) => {
        const btn = e.target.closest("button");
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      },
      { passive: false },
    );

    App.Utils.once("offline-banner", () => {
      const banner = document.getElementById("offline-banner");
      if (!banner) return;
      const update = () =>
        navigator.onLine
          ? banner.setAttribute("hidden", "")
          : banner.removeAttribute("hidden");
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      update();
    });

  // Utilities
  function debounce(fn, delay = 500) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  

  async function callOpenRouterAPI(prompt) {
    try {
      if (!App.Config.openrouterApiKey) {
        throw new Error("Missing OpenRouter API key");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${App.Config.openrouterApiKey}`,
        },
        body: JSON.stringify({
          model: App.Config.defaultModel || "openrouter/auto",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful songwriting assistant. When chords are provided, return chords and lyrics on alternating lines without additional commentary. Label song sections in square brackets (e.g., [Verse 1], [Chorus]).",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        let errText = await res.text().catch(() => "");
        try {
          const errJson = JSON.parse(errText);
          errText = errJson?.error?.message || errText;
        } catch {}
        throw new Error(
          `OpenRouter error ${res.status}: ${errText || res.statusText}`,
        );
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("AI returned no content");
      return content;
    } catch (err) {
      console.error("OpenRouter request failed", err);
      if (
        typeof ClipboardManager !== "undefined" &&
        ClipboardManager.showToast
      ) {
        ClipboardManager.showToast(
          `AI request failed: ${err.message || err}`,
          "error",
        );
      } else {
        alert("AI request failed");
      }
      return "";
    }
  }
  const ClipboardManager = App.Utils && App.Utils.ClipboardManager;
  const { cleanAIOutput, enforceAlternating, normalizeSectionLabels } = App.Utils || {};

  const app = {
    // DOM Elements (keeping existing ones and adding new)
    editorMode: document.getElementById("editor-mode"),
    lyricsEditorContainer: document.getElementById("lyrics-editor-container"),
    lyricsDisplay: document.getElementById("lyrics-display"),
    decreaseFontBtn: document.getElementById("font-decrease"),
    increaseFontBtn: document.getElementById("font-increase"),
    fontSizeDisplay: document.getElementById("font-size-display"),
    toggleThemeBtn: document.getElementById("theme-toggle-btn"),
    exitEditorBtn: document.getElementById("exit-editor-btn"),
    scrollToTopBtn: document.getElementById("scroll-to-top-btn"),
    toggleChordsBtn: document.getElementById("toggle-chords-btn"),
    toggleReadOnlyBtn: document.getElementById("toggle-read-only-btn"),
    editModeSelect: document.getElementById("edit-mode-select"),
    undoBtn: document.getElementById("undo-btn"),
    redoBtn: document.getElementById("redo-btn"),
    editorMenuBtn: document.getElementById("editor-menu-btn"),
    addSectionBtn: document.getElementById("add-section-btn"),
    addSectionModal: document.getElementById("add-section-modal"),
    aiContextMenu: document.getElementById("ai-context-menu"),
    aiToolsBtn: document.getElementById("ai-tools-btn"),
    aiSettingsBtn: document.getElementById("ai-settings-btn"),
    aiSettingsPanel: document.getElementById("ai-settings-panel"),
    aiSettingsClose: document.getElementById("ai-settings-close"),
    apiKeyInput: document.getElementById("openrouter-api-key"),
    modelSearchInput: document.getElementById("model-search"),
    modelList: document.getElementById("model-list"),
    saveAISettingsBtn: document.getElementById("save-ai-settings"),
    additionalNotesInput: document.getElementById("ai-additional-notes"),
    measureModeToggle: document.getElementById("measure-mode-toggle"),
    rhymeModeToggle: document.getElementById("rhyme-mode-toggle"),
    sectionMenu: document.getElementById("section-menu"),

    // State (keeping existing and adding new)
    songs: [],
    editorSongs: [],
    currentEditorSongIndex: -1,
    fontSize: 16,
    minFontSize: 8,
    maxFontSize: 72,
    fontSizeStep: 1,
    perSongFontSizes: safeParse(
      localStorage.getItem("perSongFontSizes"),
      {},
    ),
    isReadOnly: false,
    isChordsVisible: true,
    isMeasureMode: false,
    isRhymeMode: false,
    editMode: localStorage.getItem("editorMode") || "both",
    currentSong: null,
    defaultSections:
      "[Intro]\n\n[Verse 1]\n\n[Pre-Chorus]\n\n[Chorus]\n\n[Verse 2]\n\n[Bridge]\n\n[Outro]",
    resizeObserver: null,
    longPressTimer: null,
    hasUnsavedChanges: false, // Track unsaved changes
    availableModels: [],
    selectedModel: "",
    undoStack: [],
    redoStack: [],
    sectionMenuTarget: null,
    sectionSortable: null,
    lastSnapshotTime: 0,

    syllableCount(word) {
      word = word.toLowerCase();
      if (word.length <= 3) {
        return 1;
      }
      word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
      word = word.replace(/^y/, "");
      return word.match(/[aeiouy]{1,2}/g)?.length || 0;
    },

    init() {
      this.loadData();
      this.loadAISettings();
      this.setupEventListeners();
      this.debouncedSaveCurrentSong = debounce(
        () => this.saveCurrentSong(false),
        500,
      );
      this.loadEditorState();
      if (this.editModeSelect) {
        this.editModeSelect.value = this.editMode;
      }
      if (this.rhymeModeToggle) {
        this.rhymeModeToggle.checked = this.isRhymeMode;
      }
      this.displayCurrentEditorSong();
      window.addEventListener("beforeunload", (e) => {
        if (this.hasUnsavedChanges) {
          e.preventDefault();
          e.returnValue = "";
        }
      });

      this.setupResizeObserver();
      // Preserve default visibility when config flag is undefined
      if (App.Config && Object.prototype.hasOwnProperty.call(App.Config, 'chordsModeEnabled')) {
        this.isChordsVisible = !!App.Config.chordsModeEnabled;
      }
      this.updateChordsVisibility();
    },

    showSaveStatus(state = "saved") {
      const el = document.getElementById("save-status");
      if (!el) return;
      el.classList.add("visible");
      if (state === "unsaved") {
        el.textContent = "Unsaved changes";
        el.classList.add("unsaved");
      }
      if (state === "saving") {
        el.textContent = "Saving…";
        el.classList.add("unsaved");
      }
      if (state === "saved") {
        el.textContent = "All changes saved";
        el.classList.remove("unsaved");
      }
      if (state === "error") {
        el.textContent = "Save failed";
        el.classList.add("unsaved");
      }
      clearTimeout(this._saveStatusTimer);
      this._saveStatusTimer = setTimeout(() => {
        el.classList.remove("visible");
      }, 2000);
    },

    safeLocalStorageSet(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        console.warn("localStorage write failed", e);
        ClipboardManager?.showToast?.("Storage full or blocked", "error");
        return false;
      }
    },
    loadData() {
      this.songs = safeParse(localStorage.getItem(App.Config.STORAGE.SONGS), []);
      const theme = localStorage.getItem("theme") || "dark";
      document.documentElement.dataset.theme = theme;
    },

    // Enhanced song creation with metadata
    createSong(title, lyrics = "", chords = "") {
      const normalizedLyrics = lyrics.trim()
        ? normalizeSectionLabels(lyrics)
        : this.defaultSections;
      return {
        id: Date.now().toString(),
        title,
        lyrics: normalizedLyrics,
        chords,
        key: "",
        tempo: 120,
        timeSignature: "4/4",
        notes: "",
        createdAt: new Date().toISOString(),
        lastEditedAt: new Date().toISOString(),
        tags: [],
      };
    },

    trimExtraEmptyLines(text = "") {
      const lines = text.split("\n");
      const result = [];
      let prevEmpty = false;
      for (const line of lines) {
        const isEmpty = line.trim() === "";
        if (isEmpty && prevEmpty) continue;
        result.push(line);
        prevEmpty = isEmpty;
      }
      return result.join("\n");
    },

    trimDomEmptyLines() {
      const trimContainer = (container) => {
        let prevEmpty = false;
        Array.from(container.children).forEach((child) => {
          if (!child.classList.contains("lyrics-line-group")) return;
          const lyric =
            child.querySelector(".lyric-text")?.textContent.trim() || "";
          const chord =
            child.querySelector(".chord-line")?.textContent.trim() || "";
          const isEmpty = lyric === "" && chord === "";
          if (isEmpty && prevEmpty) {
            child.remove();
          } else {
            prevEmpty = isEmpty;
          }
        });
      };
      trimContainer(this.lyricsDisplay);
      this.lyricsDisplay
        .querySelectorAll(".section-content")
        .forEach((sc) => trimContainer(sc));
    },

    getSongState() {
      return {
        lyrics: this.currentSong?.lyrics || "",
        chords: this.currentSong?.chords || "",
      };
    },

    saveUndoStack() {
      if (!this.currentSong) return;
      const key = `undoStack_${this.currentSong.id}`;
      const limited = this.undoStack.slice(-20);
      localStorage.setItem(key, JSON.stringify(limited));
    },

    pushUndoState() {
      const now = Date.now();
      const state = this.getSongState();
      if (now - this.lastSnapshotTime < 1000) return;
      this.undoStack.push({ ...state });
      if (this.undoStack.length > 20) this.undoStack.shift();
      this.lastSnapshotTime = now;
      this.redoStack = [];
      this.saveUndoStack();
    },

    applySongState(state) {
      if (!this.currentSong) return;
      this.currentSong.lyrics = state.lyrics;
      this.currentSong.chords = state.chords;
      this.renderLyrics();
      this.debouncedSaveCurrentSong && this.debouncedSaveCurrentSong();
    },

    undo() {
      if (this.undoStack.length === 0) return;
      const current = this.getSongState();
      this.redoStack.push(current);
      const prev = this.undoStack.pop();
      this.applySongState(prev);
      this.saveUndoStack();
    },

    redo() {
      if (this.redoStack.length === 0) return;
      const current = this.getSongState();
      this.undoStack.push(current);
      const next = this.redoStack.pop();
      this.applySongState(next);
      this.saveUndoStack();
    },

    setupEventListeners() {
      // Existing event listeners
      this.decreaseFontBtn?.addEventListener("click", () =>
        this.adjustFontSize(-this.fontSizeStep),
      );
      this.increaseFontBtn?.addEventListener("click", () =>
        this.adjustFontSize(this.fontSizeStep),
      );
      this.toggleThemeBtn?.addEventListener("click", () => this.toggleTheme());
      this.exitEditorBtn?.addEventListener("click", () =>
        this.exitEditorMode(),
      );
      this.lyricsDisplay?.addEventListener("click", (e) =>
        this.handleLyricsClick(e),
      );
      this.lyricsDisplay?.addEventListener("keydown", (e) =>
        this.handleLyricsKeydown(e),
      );
      this.scrollToTopBtn?.addEventListener("click", () => this.scrollToTop());
      // Handle modal items
      document
        .getElementById("toggle-chords-btn")
        ?.addEventListener("click", () => {
          this.toggleChords();
        });
      document
        .getElementById("toggle-read-only-btn")
        ?.addEventListener("click", () => {
          this.toggleReadOnly();
        });
      this.editModeSelect?.addEventListener("change", (e) => {
        this.editMode = e.target.value;
        localStorage.setItem("editorMode", this.editMode);
        this.updateReadOnlyState();
      });
      document
        .getElementById("save-song-btn")
        ?.addEventListener("click", () => {
          this.saveCurrentSong(true);
        });

      document
        .getElementById("ai-format-btn")
        ?.addEventListener("click", () => {
          this.invokeAIFormat();
        });

      document.getElementById("regenre-btn")?.addEventListener("click", () => {
        const genre = prompt(
          'Enter target genre (e.g., "Country", "Jazz", "Trap")',
        );
        if (genre) {
          this.invokeReGenre(genre);
        }
      });

      this.undoBtn?.addEventListener("click", () => {
        this.undo();
      });
      this.redoBtn?.addEventListener("click", () => {
        this.redo();
      });
      document
        .getElementById("export-single-song")
        ?.addEventListener("click", () => {
          if (!this.currentSong) return;
          const format = prompt('Export format? Enter "json" or "txt"', "txt");
          if (!format) return;
          let blob, filename;
          if (format.toLowerCase() === "json") {
            const data = JSON.stringify(this.currentSong, null, 2);
            blob = new Blob([data], { type: "application/json" });
            filename = `${this.currentSong.title.replace(/\s+/g, "_")}.json`;
          } else {
            const content = ClipboardManager.formatSongForExport(
              this.currentSong,
              true,
            );
            blob = new Blob([content], { type: "text/plain" });
            filename = `${this.currentSong.title.replace(/\s+/g, "_")}.txt`;
          }
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
      this.measureModeToggle?.addEventListener("change", (e) => {
        this.isMeasureMode = e.target.checked;
        if (this.currentSong) {
          localStorage.setItem(
            `measureMode_${this.currentSong.id}`,
            this.isMeasureMode ? "1" : "0",
          );
        }
        this.renderLyrics();
      });

      this.rhymeModeToggle?.addEventListener("change", (e) => {
        this.isRhymeMode = e.target.checked;
        this.renderLyrics();
      });

      this.addSectionBtn?.addEventListener("click", () => {
        this.addSectionModal?.classList.add("visible");
      });
      this.addSectionModal
        ?.querySelectorAll("[data-section]")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const label = e.currentTarget.dataset.section;
            this.insertSectionAtCursor(label);
            this.addSectionModal.classList.remove("visible");
          });
        });
      this.addSectionModal
        ?.querySelector(".close-modal-btn")
        ?.addEventListener("click", () => {
          this.addSectionModal.classList.remove("visible");
        });

      this.aiSettingsBtn?.addEventListener("click", () => {
        this.openAISettings();
      });
      this.aiSettingsClose?.addEventListener("click", () => {
        this.aiSettingsPanel.style.display = "none";
      });
      this.saveAISettingsBtn?.addEventListener("click", () =>
        this.saveAISettings(),
      );
      this.modelSearchInput?.addEventListener("input", () =>
        this.renderModelList(this.modelSearchInput.value),
      );
      // Long-press or right-click to show AI context menu
      this.lyricsDisplay?.addEventListener("touchstart", (e) =>
        this.startLongPress(e),
      );
      this.lyricsDisplay?.addEventListener("touchend", () =>
        this.cancelLongPress(),
      );
      this.lyricsDisplay?.addEventListener("touchmove", () =>
        this.cancelLongPress(),
      );
      this.lyricsDisplay?.addEventListener("mousedown", (e) =>
        this.startLongPress(e),
      );
      this.lyricsDisplay?.addEventListener("mouseup", () =>
        this.cancelLongPress(),
      );
      this.lyricsDisplay?.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const label = e.target.closest(".section-label");
        if (label && !e.target.classList.contains("drag-handle")) {
          this.openSectionMenu(e);
        } else {
          this.handleTextSelection();
        }
      });
      document
        .querySelectorAll("#ai-context-menu button[data-action]")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            const text = window.getSelection().toString();
            this.handleAIAction(action, text);
            this.aiContextMenu.style.display = "none";
          });
        });
      document
        .getElementById("ai-menu-close")
        ?.addEventListener("click", () => {
          this.aiContextMenu.style.display = "none";
          window.getSelection()?.removeAllRanges();
        });
      this.sectionMenu
        ?.querySelectorAll("button[data-action]")
        ?.forEach((btn) => {
          btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            this.handleSectionMenuAction(action);
            this.sectionMenu.style.display = "none";
          });
        });
      document
        .getElementById("section-menu-close")
        ?.addEventListener("click", () => {
          this.sectionMenu.style.display = "none";
        });
      document.addEventListener("click", (e) => {
        if (
          this.aiContextMenu.style.display === "flex" &&
          !this.aiContextMenu.contains(e.target)
        ) {
          this.aiContextMenu.style.display = "none";
          window.getSelection()?.removeAllRanges();
        }
        if (
          this.sectionMenu &&
          this.sectionMenu.style.display === "flex" &&
          !this.sectionMenu.contains(e.target)
        ) {
          this.sectionMenu.style.display = "none";
        }
      });

      // Metadata input listeners
      [
        "song-title-meta",
        "song-key",
        "song-tempo-meta",
        "song-time-signature",
        "song-tags",
        "song-notes",
      ].forEach((id) => {
        document
          .getElementById(id)
          ?.addEventListener("input", () => this.updateSongMetadata());
      });

      // Keyboard shortcuts
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          this.saveCurrentSong(true);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
          e.preventDefault();
          this.undo();
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          (e.key === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
        ) {
          e.preventDefault();
          this.redo();
        }
        if (e.key === "Escape") {
          document.getElementById("editor-modal")?.classList.remove("visible");
          document
            .getElementById("ai-tools-modal")
            ?.classList.remove("visible");
          document.getElementById("copy-modal")?.classList.remove("visible");
        }
      });
    },

    setupResizeObserver() {
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          clearTimeout(this.resizeTimeout);
          this.resizeTimeout = setTimeout(() => {
            // optional fit logic
          }, 100);
        });
        this.resizeObserver.observe(this.editorMode);
      }
    },

    loadAISettings() {
      const key = localStorage.getItem("openrouterApiKey") || "";
      const model = localStorage.getItem("openrouterModel") || "";
      App.Config = App.Config || {};
      if (typeof App.Config.autosaveEnabled === "undefined")
        App.Config.autosaveEnabled = true;
      App.Config.openrouterApiKey = key;
      App.Config.defaultModel = model;
      this.selectedModel = model;
      if (this.apiKeyInput) this.apiKeyInput.value = key;
    },

    openAISettings() {
      if (this.aiSettingsPanel) {
        this.aiSettingsPanel.style.display = "block";
        if (!this.availableModels.length) {
          this.fetchModels();
        } else {
          this.renderModelList(this.modelSearchInput?.value || "");
        }
      }
    },

    saveAISettings() {
      const key = this.apiKeyInput?.value.trim() || "";
      App.Config.openrouterApiKey = key;
      App.Config.defaultModel = this.selectedModel;
      localStorage.setItem("openrouterApiKey", key);
      localStorage.setItem("openrouterModel", this.selectedModel);
      this.aiSettingsPanel.style.display = "none";
    },

    async fetchModels() {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models");
        const data = await res.json();
        this.availableModels = data.data || [];
        this.renderModelList(this.modelSearchInput?.value || "");
      } catch (err) {
        console.error("Failed to fetch models", err);
      }
    },

    renderModelList(filter = "") {
      if (!this.modelList) return;
      const term = filter.toLowerCase();
      this.modelList.innerHTML = "";
      this.availableModels
        .filter((m) => m.id.toLowerCase().includes(term))
        .forEach((m) => {
          const item = document.createElement("div");
          item.className =
            "model-item" + (m.id === this.selectedModel ? " selected" : "");
          item.textContent = m.id;
          item.addEventListener("click", () => {
            this.selectedModel = m.id;
            App.Config.defaultModel = m.id;
            localStorage.setItem("openrouterModel", m.id);
            this.renderModelList(term);
          });
          this.modelList.appendChild(item);
        });
    },

    startLongPress(e) {
      const target = e.target;
      this.longPressTimer = setTimeout(() => {
        if (
          target.classList?.contains("lyric-text") &&
          target.textContent.trim() === ""
        ) {
          target.focus();
          this.addSectionModal?.classList.add("visible");
        } else {
          this.handleTextSelection();
        }
      }, 600);
    },

    cancelLongPress() {
      clearTimeout(this.longPressTimer);
    },

    handleTextSelection() {
      if (!this.aiContextMenu) return;
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        const startEl = range.startContainer.parentElement;
        if (!startEl.closest(".lyrics-line")) {
          this.aiContextMenu.style.display = "none";
          return;
        }
        const rect = range.getBoundingClientRect();
        const topOffset = window.innerWidth < 600 ? 40 : 8;
        let top = rect.bottom + window.scrollY + topOffset;
        let left = rect.left + window.scrollX;
        this.aiContextMenu.style.display = "flex";
        const menuWidth = this.aiContextMenu.offsetWidth;
        const menuHeight = this.aiContextMenu.offsetHeight;
        if (left + menuWidth > window.scrollX + window.innerWidth) {
          left = window.scrollX + window.innerWidth - menuWidth - 8;
        }
        if (left < window.scrollX + 8) {
          left = window.scrollX + 8;
        }
        if (top + menuHeight > window.scrollY + window.innerHeight) {
          top = rect.top + window.scrollY - menuHeight - topOffset;
        }
        if (top < window.scrollY + 8) {
          top = window.scrollY + 8;
        }
        this.aiContextMenu.style.top = `${top}px`;
        this.aiContextMenu.style.left = `${left}px`;
      } else {
        this.aiContextMenu.style.display = "none";
      }
    },

    openSectionMenu(e) {
      if (!this.sectionMenu) return;
      this.sectionMenuTarget = e.target.closest(".section");
      if (this.aiContextMenu) this.aiContextMenu.style.display = "none";
      this.sectionMenu.style.display = "flex";
      this.sectionMenu.style.left = `${e.pageX}px`;
      this.sectionMenu.style.top = `${e.pageY}px`;
    },

    handleSectionMenuAction(action) {
      if (!this.sectionMenuTarget) return;
      const section = this.sectionMenuTarget;
      if (action === "rename") {
        const label = section.querySelector(".section-label-text");
        label?.focus();
        document.execCommand?.("selectAll", false, null);
      } else if (action === "delete-label") {
        const content = section.querySelector(".section-content");
        while (content.firstChild) {
          this.lyricsDisplay.insertBefore(content.firstChild, section);
        }
        section.remove();
        this.handleLyricsInput();
        this.initSectionDrag();
      } else if (action === "delete-section") {
        section.remove();
        this.handleLyricsInput();
        this.initSectionDrag();
      }
      this.sectionMenuTarget = null;
    },

    initSectionDrag() {
      if (!this.lyricsDisplay || typeof Sortable === "undefined") return;
      if (this.sectionSortable) {
        this.sectionSortable.destroy();
      }
      this.sectionSortable = Sortable.create(this.lyricsDisplay, {
        animation: 150,
        handle: ".drag-handle",
        draggable: ".section",
        onEnd: () => this.handleLyricsInput(),
      });
    },

    handleAIAction(action, selectedText) {
      const prompts = {
        rhyme: `Find rhymes for: ${selectedText}`,
        reword: `Suggest alternative wording for: ${selectedText}`,
        rewrite: `Rewrite this line in a different tone: ${selectedText}`,
        continue: `Continue the lyrics after: ${selectedText}. Include chord suggestions and return chords and lyrics on alternating lines, labeling sections in square brackets.`,
      };
      const prompt = prompts[action];
      if (!App.Config.openrouterApiKey) {
        console.warn("OpenRouter API key not set");
        alert("Please set your OpenRouter API key in AI Settings.");
        return;
      }
      this.callOpenRouter(prompt);
    },

    async callOpenRouter(prompt, append = false) {
      const notes = this.additionalNotesInput?.value.trim();
      const fullPrompt = notes
        ? `${prompt}\nAdditional notes: ${notes}`
        : prompt;
      const response = await callOpenRouterAPI(fullPrompt);
      if (!response) return;

      // Handle context menu actions based on prompt
      if (fullPrompt.startsWith("Find rhymes for:")) {
        ClipboardManager.showToast(response, "info");
        return;
      }

      const selection = window.getSelection();
      if (
        fullPrompt.startsWith("Suggest alternative wording") ||
        fullPrompt.startsWith("Rewrite this line")
      ) {
        if (selection && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(response));
          selection.removeAllRanges();
          this.saveCurrentSong(true);
        }
        return;
      }

      if (fullPrompt.startsWith("Continue the lyrics after:")) {
        if (selection && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          range.collapse(false);
          range.insertNode(document.createTextNode("\n" + response));
          selection.removeAllRanges();
          this.saveCurrentSong(true);
        }
        return;
      }

      // For AI tools or when no selection, apply to entire song
      this.applyAIResult(response, append);
    },

    async invokeAIFormat() {
      if (!this.currentSong) return;
      try {
        const song = this.currentSong;
        const formatted = ClipboardManager.formatLyricsWithChords(
          song.lyrics || "",
          song.chords || "",
        );
        let prompt = `Clean up the formatting for this song and return chords and lyrics on alternating lines with section labels in square brackets.\nTitle: ${song.title}\nKey: ${song.key}\nTempo: ${song.tempo}\nTime Signature: ${song.timeSignature}\n\n${formatted}`;
        const notes = this.additionalNotesInput?.value.trim();
        if (notes) prompt += `\nAdditional notes: ${notes}`;
        const response = await callOpenRouterAPI(prompt);
        if (response) {
          this.applyAIResult(response, false, "AI formatting applied!");
        }
      } catch (err) {
        console.error("AI format error", err);
      }
    },

    async invokeReGenre(newGenre) {
      if (!this.currentSong) return;
      try {
        const song = this.currentSong;
        const formatted = ClipboardManager.formatLyricsWithChords(
          song.lyrics || "",
          song.chords || "",
        );
        const tags = song.tags?.length ? song.tags.join(", ") : "";
        let prompt = `Rewrite the following song in the ${newGenre} genre while preserving meaning and structure. Return chords and lyrics on alternating lines with section labels in square brackets.\nTitle: ${song.title}\nKey: ${song.key}\nTempo: ${song.tempo}\nTags: ${tags}\n\n${formatted}`;
        const notes = this.additionalNotesInput?.value.trim();
        if (notes) prompt += `\nAdditional notes: ${notes}`;
        const response = await callOpenRouterAPI(prompt);
        if (response) {
          this.applyAIResult(response, false, `Re-genred as ${newGenre}`);
        }
      } catch (err) {
        console.error("Re-genre error", err);
      }
    },

    applyAIResult(
      responseText,
      append = false,
      toastMessage = "AI update applied",
    ) {
      if (!this.currentSong) return;
      const cleaned = cleanAIOutput(responseText);
      const lines = cleaned.split(/\n/);
      const { chords, lyrics } = enforceAlternating(lines);
      const lyricsText = normalizeSectionLabels(lyrics.join("\n"));
      const chordsText = chords.join("\n");

      if (append) {
        this.currentSong.lyrics = [this.currentSong.lyrics, lyricsText]
          .filter(Boolean)
          .join("\n");
        this.currentSong.chords = [this.currentSong.chords, chordsText]
          .filter(Boolean)
          .join("\n");
      } else {
        this.currentSong.lyrics = lyricsText;
        this.currentSong.chords = chordsText;
      }

      this.renderLyrics();
      this.saveCurrentSong(true);
      ClipboardManager.showToast(toastMessage, "success");
    },

    loadEditorState() {
      const params = new URLSearchParams(window.location.search);
      const isNew = params.get("new") === "1";
      const songId = params.get("songId");
      this.editorSongs = this.songs;

      if (isNew) {
        this.currentEditorSongIndex = -1;
        this.currentSong = this.createSong("");
      } else if (songId) {
        this.currentEditorSongIndex = this.editorSongs.findIndex(
          (s) => String(s.id) === String(songId),
        );
        if (this.currentEditorSongIndex !== -1) {
          this.currentSong = this.editorSongs[this.currentEditorSongIndex];
        } else {
          // Fallback: if songs exist, open the first one; otherwise create a new song
          if (this.editorSongs && this.editorSongs.length > 0) {
            this.currentEditorSongIndex = 0;
            this.currentSong = this.editorSongs[0];
          } else {
            this.currentEditorSongIndex = -1;
            this.currentSong = this.createSong("");
          }
        }
      } else {
        // No songId provided: open first song if available, else create new
        if (this.editorSongs && this.editorSongs.length > 0) {
          this.currentEditorSongIndex = 0;
          this.currentSong = this.editorSongs[0];
        } else {
          this.currentEditorSongIndex = -1;
          this.currentSong = this.createSong("");
        }
      }
    },

    updateSongMetadata() {
      if (!this.currentSong) return;

      const titleEl = document.getElementById("song-title-meta");
      const keyEl = document.getElementById("song-key");
      const tempoEl = document.getElementById("song-tempo-meta");
      const tsEl = document.getElementById("song-time-signature");
      const tagsEl = document.getElementById("song-tags");
      const notesEl = document.getElementById("song-notes");

      const newTitle = titleEl?.value.trim() || "";
      if (this.currentSong.title !== newTitle) {
        this.currentSong.title = newTitle;
        document.getElementById("app-title").textContent = newTitle;
        this.hasUnsavedChanges = true;
      }

      const newKey = keyEl?.value || "";
      if (this.currentSong.key !== newKey) {
        this.currentSong.key = newKey;
        this.hasUnsavedChanges = true;
      }

      const tempoValue = parseInt(tempoEl?.value) || 120;
      if (this.currentSong.tempo !== tempoValue) {
        this.currentSong.tempo = tempoValue;
        this.hasUnsavedChanges = true;
      }

      const tsValue = tsEl?.value || "4/4";
      if (this.currentSong.timeSignature !== tsValue) {
        this.currentSong.timeSignature = tsValue;
        this.hasUnsavedChanges = true;
      }

      const notesValue = notesEl?.value || "";
      if (this.currentSong.notes !== notesValue) {
        this.currentSong.notes = notesValue;
        this.hasUnsavedChanges = true;
      }

      const tagsValue = tagsEl?.value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t);
      if (JSON.stringify(this.currentSong.tags) !== JSON.stringify(tagsValue)) {
        this.currentSong.tags = tagsValue;
        this.hasUnsavedChanges = true;
      }
    },

    saveCurrentSong(isExplicit = false) {
      if (!this.currentSong || (!App.Config.autosaveEnabled && !isExplicit))
        return;
      this.showSaveStatus("saving");
      try {
        const lyricNodes = Array.from(
          this.lyricsDisplay.querySelectorAll(
            ".section-label-text, .lyric-text",
          ),
        );
        const lyricLines = [];
        const chordLines = [];
        lyricNodes.forEach((node) => {
          if (node.classList.contains("section-label-text")) {
            lyricLines.push(node.textContent);
          } else {
            lyricLines.push(node.textContent);
            const group = node.closest(".lyrics-line-group");
            const chord =
              group?.querySelector(".chord-line")?.textContent || "";
            chordLines.push(chord);
          }
        });

        const lyrics = this.trimExtraEmptyLines(lyricLines.join("\n"));
        const chords = this.trimExtraEmptyLines(chordLines.join("\n"));

        const titleTrim = (this.currentSong.title || "").trim();
        const lyricsTrim = lyrics.trim();
        const chordsTrim = chords.trim();
        const isDefaultLyrics = lyricsTrim === this.defaultSections.trim();
        const isBlank =
          !titleTrim && !chordsTrim && (lyricsTrim === "" || isDefaultLyrics);
        if (isBlank) {
          const idx = this.songs.findIndex((s) => s.id === this.currentSong.id);
          if (idx !== -1) {
            this.songs.splice(idx, 1);
            this.safeLocalStorageSet(App.Config.STORAGE.SONGS, JSON.stringify(this.songs));
          }
          this.hasUnsavedChanges = false;
          this.showSaveStatus("saved");
          return;
        }

        this.currentSong.lyrics = normalizeSectionLabels(lyrics);
        this.currentSong.chords = chords;
        this.currentSong.lastEditedAt = new Date().toISOString();
        const editedText = new Date(
          this.currentSong.lastEditedAt,
        ).toLocaleString();
        const editedEl = document.getElementById("song-edited");
        const editedMetaEl = document.getElementById("song-edited-meta");
        if (editedEl) editedEl.textContent = editedText;
        if (editedMetaEl) editedMetaEl.textContent = editedText;

        const songIndex = this.songs.findIndex(
          (s) => s.id === this.currentSong.id,
        );
        if (songIndex !== -1) {
          this.songs[songIndex] = this.currentSong;
        } else {
          this.songs.push(this.currentSong);
          this.currentEditorSongIndex = this.songs.findIndex(
            (s) => s.id === this.currentSong.id,
          );
        }
        const ok = this.safeLocalStorageSet(
          App.Config.STORAGE.SONGS,
          JSON.stringify(this.songs),
        );
        if (ok) {
          this.hasUnsavedChanges = false;
          this.showSaveStatus("saved");
        } else {
          this.showSaveStatus("error");
        }
      } catch (e) {
        console.error("saveCurrentSong failed", e);
        this.showSaveStatus("error");
      }
    },

    displayCurrentEditorSong() {
      if (this.currentEditorSongIndex === -1) {
        this.currentSong = this.currentSong || this.createSong("");
      } else {
        this.currentSong = this.editorSongs[this.currentEditorSongIndex];
      }

      // Ensure song has all metadata fields
      if (!this.currentSong.key) this.currentSong.key = "";
      if (!this.currentSong.tempo) this.currentSong.tempo = 120;
      if (!this.currentSong.timeSignature)
        this.currentSong.timeSignature = "4/4";
      if (!this.currentSong.notes) this.currentSong.notes = "";
      if (!this.currentSong.tags) this.currentSong.tags = [];
      if (!this.currentSong.createdAt)
        this.currentSong.createdAt = new Date().toISOString();
      if (!this.currentSong.lastEditedAt)
        this.currentSong.lastEditedAt = new Date().toISOString();

      this.fontSize = this.perSongFontSizes[this.currentSong.id] || 16;

      document.getElementById("app-title").textContent = this.currentSong.title;
      this.fontSizeDisplay.textContent = `${Math.round((this.fontSize / 16) * 100)}%`;

      const mm = localStorage.getItem(`measureMode_${this.currentSong.id}`);
      this.isMeasureMode = mm === "1";
      if (this.measureModeToggle)
        this.measureModeToggle.checked = this.isMeasureMode;

      // Populate metadata panel
      document.getElementById("song-title-meta").value =
        this.currentSong.title || "";
      document.getElementById("song-key").value = this.currentSong.key || "";
      document.getElementById("song-tempo-meta").value =
        this.currentSong.tempo || 120;
      document.getElementById("song-time-signature").value =
        this.currentSong.timeSignature || "4/4";
      document.getElementById("song-tags").value =
        this.currentSong.tags.join(", ");
      document.getElementById("song-notes").value =
        this.currentSong.notes || "";
      document.getElementById("song-created").textContent = new Date(
        this.currentSong.createdAt,
      ).toLocaleString();
      const editedText = new Date(
        this.currentSong.lastEditedAt,
      ).toLocaleString();
      const headerEdited = document.getElementById("song-edited");
      const metaEdited = document.getElementById("song-edited-meta");
      if (headerEdited) headerEdited.textContent = editedText;
      if (metaEdited) metaEdited.textContent = editedText;

      this.currentSong.lyrics = normalizeSectionLabels(this.currentSong.lyrics || "");

      const linesNoTitle = this.currentSong.lyrics.split("\n");
      const normalizedTitle = (this.currentSong.title || "")
        .trim()
        .toLowerCase();
      if (
        linesNoTitle.length &&
        linesNoTitle[0].trim().toLowerCase() === normalizedTitle
      ) {
        linesNoTitle.shift();
        if (linesNoTitle[0]?.trim() === "") {
          linesNoTitle.shift();
        }
        this.currentSong.lyrics = linesNoTitle.join("\n");
      }

      this.renderLyrics();

      // Initialize undo/redo stacks for this song
      const stored = localStorage.getItem(`undoStack_${this.currentSong.id}`);
      const parsed = safeParse(stored, null);
      if (parsed) {
        this.undoStack = parsed.slice(-20);
      } else {
        this.undoStack = [this.getSongState()];
      }
      this.redoStack = [];
      this.lastSnapshotTime = Date.now();
      this.saveUndoStack();
      this.saveCurrentSong(true);
    },

    renderLyrics() {
      if (!this.currentSong) return;
      const lyrics = this.currentSong.lyrics || "";
      const chords = this.currentSong.chords || "";

      let lyricLines = lyrics.split("\n");
      let chordLines = chords.split("\n");

      const normalizedTitle = (this.currentSong.title || "")
        .trim()
        .toLowerCase();
      if (
        lyricLines.length &&
        lyricLines[0].trim().toLowerCase() === normalizedTitle
      ) {
        lyricLines.shift();
        if (lyricLines[0]?.trim() === "") {
          lyricLines.shift();
        }
        if (chordLines.length) {
          chordLines.shift();
        }
      }

      this.lyricsDisplay.innerHTML = "";

      const __frag = document.createDocumentFragment();

      const rhymeGroups = this.isRhymeMode ? this.findRhymes(lyricLines) : {};

      let chordIndex = 0;
      let currentSectionContent = null;

      for (let i = 0; i < lyricLines.length; i++) {
        const lyricLine = lyricLines[i];

        if (/^\[.*\]$/.test(lyricLine.trim())) {
          const section = document.createElement("div");
          section.className = "section";
          const header = document.createElement("div");
          header.className = "lyrics-line section-label";
          const handle = document.createElement("i");
          handle.className = "fas fa-grip-lines drag-handle";
          header.appendChild(handle);
          const labelSpan = document.createElement("span");
          labelSpan.className = "section-label-text";
          labelSpan.textContent = lyricLine.trim();
          labelSpan.setAttribute("contenteditable", "true");
          labelSpan.addEventListener("input", () => this.handleLyricsInput());
          header.appendChild(labelSpan);
          header.addEventListener("click", (e) => {
            if (!e.target.classList.contains("drag-handle")) {
              section.classList.toggle("collapsed");
            }
          });
          section.appendChild(header);
          const content = document.createElement("div");
          content.className = "section-content";
          section.appendChild(content);
          __frag.appendChild(section);
          currentSectionContent = content;
          continue;
        }

        const chordLine = chordLines[chordIndex] || "";
        chordIndex++;
        const targetContainer = currentSectionContent || this.lyricsDisplay;

        if (this.isMeasureMode) {
          const words = lyricLine.split(/\s+/).filter((w) => w.length > 0);
          let currentMeasure = "";
          let currentSyllableCount = 0;
          const beatsPerMeasure = 4;
          const syllablesPerBeat = 2;
          const maxSyllablesPerMeasure = beatsPerMeasure * syllablesPerBeat;
          let measures = [];
          for (let word of words) {
            const wordSyllables = this.syllableCount(word);
            if (currentSyllableCount + wordSyllables > maxSyllablesPerMeasure) {
              measures.push(currentMeasure.trim());
              currentMeasure = "";
              currentSyllableCount = 0;
            }
            currentMeasure += word + " ";
            currentSyllableCount += wordSyllables;
          }
          if (currentMeasure) measures.push(currentMeasure.trim());
          for (const measure of measures) {
            const measureSyllables = measure
              .split(/\s+/)
              .filter((w) => w.length > 0)
              .reduce((sum, word) => sum + this.syllableCount(word), 0);
            this.addLyricLine(
              chordLine,
              measure,
              rhymeGroups[i],
              measureSyllables,
              targetContainer,
            );
          }
        } else {
          const lineSyllables = lyricLine
            .split(/\s+/)
            .filter((w) => w.length > 0)
            .reduce((sum, word) => sum + this.syllableCount(word), 0);
          this.addLyricLine(
            chordLine,
            lyricLine,
            rhymeGroups[i],
            lineSyllables,
            targetContainer,
          );
        }
      }
      this.lyricsDisplay.appendChild(__frag);
      this.lyricsDisplay.style.fontSize = `${this.fontSize}px`;
      this.initSectionDrag();
      this.updateReadOnlyState();
      this.updateChordsVisibility();
      this.updateSyllableCount();
      this.autoNumberVerses();
    },

    insertSectionAtCursor(label) {
      const section = document.createElement("div");
      section.className = "section";
      const header = document.createElement("div");
      header.className = "lyrics-line section-label";
      const handle = document.createElement("i");
      handle.className = "fas fa-grip-lines drag-handle";
      header.appendChild(handle);
      const labelSpan = document.createElement("span");
      labelSpan.className = "section-label-text";
      labelSpan.textContent = label;
      labelSpan.setAttribute("contenteditable", !this.isReadOnly);
      labelSpan.addEventListener("input", () => this.handleLyricsInput());
      header.appendChild(labelSpan);
      header.addEventListener("click", (e) => {
        if (!e.target.classList.contains("drag-handle")) {
          section.classList.toggle("collapsed");
        }
      });
      section.appendChild(header);
      const content = document.createElement("div");
      content.className = "section-content";
      section.appendChild(content);

      const selection = window.getSelection();
      let node = selection?.focusNode;
      if (node && node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
      }
      const currentSection = node?.closest?.(".section");
      let lineGroup = null;
      if (currentSection) {
        this.lyricsDisplay.insertBefore(section, currentSection.nextSibling);
      } else {
        lineGroup = node?.closest?.(".lyrics-line-group");
        if (lineGroup) {
          this.lyricsDisplay.insertBefore(section, lineGroup);
        } else {
          this.lyricsDisplay.appendChild(section);
        }
      }

      if (lineGroup) {
        const lyric = lineGroup
          .querySelector(".lyric-text")
          ?.textContent.trim();
        const chord = lineGroup
          .querySelector(".chord-line")
          ?.textContent.trim();
        if (lyric === "" && chord === "") {
          lineGroup.remove();
        }
      }

      this.initSectionDrag();
      header.focus();
      this.pushUndoState();
      this.handleLyricsInput();
      this.saveCurrentSong(true);
      this.updateReadOnlyState();
    },

    addLyricLine(
      chords,
      lyrics,
      rhymeClass,
      syllableCount,
      container = this.lyricsDisplay,
      insertBefore = null,
    ) {
      const lineGroup = document.createElement("div");
      lineGroup.className = "lyrics-line-group";

      const chordElement = document.createElement("div");
      chordElement.className = "chord-line";
      chordElement.textContent = chords;
      const editableChords =
        !this.isReadOnly &&
        (this.editMode === "chords" || this.editMode === "both");
      chordElement.setAttribute("contenteditable", editableChords);
      chordElement.classList.toggle("editable", editableChords);
      chordElement.classList.toggle("non-editable", !editableChords);
      chordElement.addEventListener("input", () => {
        this.pushUndoState();
        this.handleLyricsInput();
      });
      lineGroup.appendChild(chordElement);

      const lyricElement = document.createElement("div");
      lyricElement.className = "lyrics-line";

      const syllableSpan = document.createElement("span");
      syllableSpan.className = "syllable-count";
      syllableSpan.textContent =
        syllableCount > 0 ? String(syllableCount).padStart(2, " ") : "";
      lyricElement.appendChild(syllableSpan);

      const textSpan = document.createElement("span");
      textSpan.className = "lyric-text";
      textSpan.textContent = lyrics;
      const editableLyrics =
        !this.isReadOnly &&
        (this.editMode === "lyrics" || this.editMode === "both");
      textSpan.setAttribute("contenteditable", editableLyrics);
      textSpan.classList.toggle("editable", editableLyrics);
      textSpan.classList.toggle("non-editable", !editableLyrics);
      textSpan.addEventListener("input", () => {
        this.pushUndoState();
        this.handleLyricsInput();
        this.updateSyllableCount();
        this.updateRhymes();
      });
      lyricElement.appendChild(textSpan);

      if (rhymeClass) {
        lyricElement.classList.add(rhymeClass);
      }
      lineGroup.appendChild(lyricElement);

      if (insertBefore) {
        container.insertBefore(lineGroup, insertBefore);
      } else {
        container.appendChild(lineGroup);
      }

      return lineGroup;
    },

    updateSyllableCount() {
      const lines = this.lyricsDisplay.querySelectorAll(".lyrics-line");
      lines.forEach((line) => {
        const textSpan = line.querySelector(".lyric-text");
        const countSpan = line.querySelector(".syllable-count");
        if (!textSpan || !countSpan) return;
        const text = textSpan.textContent;
        const words = text.split(/\s+/).filter((w) => w.length > 0);
        const count = words.reduce(
          (sum, word) => sum + this.syllableCount(word),
          0,
        );
        countSpan.textContent = count > 0 ? String(count).padStart(2, " ") : "";
      });
    },

    updateRhymes() {
      const allLyricElements = Array.from(
        this.lyricsDisplay.querySelectorAll(".lyrics-line"),
      );
      const lyricElements = allLyricElements.filter(
        (el) => !el.classList.contains("section-label"),
      );
      const lines = lyricElements.map(
        (el) => el.querySelector(".lyric-text")?.textContent || "",
      );
      const rhymeGroups = this.isRhymeMode ? this.findRhymes(lines) : {};
      let idx = 0;
      allLyricElements.forEach((el) => {
        if (el.classList.contains("section-label")) {
          el.className = "lyrics-line section-label";
        } else {
          el.className = "lyrics-line";
          if (rhymeGroups[idx]) {
            el.classList.add(rhymeGroups[idx]);
          }
          idx++;
        }
      });
    },

    autoNumberVerses() {
      let count = 0;
      this.lyricsDisplay.querySelectorAll(".section-label").forEach((label) => {
        const span = label.querySelector(".section-label-text");
        const text = span?.textContent.trim() || "";
        if (/^\[verse(\s*\d*)?\]$/i.test(text)) {
          count++;
          span.textContent = `[Verse ${count}]`;
        }
      });
    },

    convertBracketSections() {
      const texts = Array.from(
        this.lyricsDisplay.querySelectorAll(".lyric-text"),
      );
      texts.forEach((textEl) => {
        const text = textEl.textContent.trim();
        if (!/^\[.*\]$/.test(text)) return;

        const lineGroup = textEl.closest(".lyrics-line-group");
        if (!lineGroup) return;

        const parentSection = lineGroup.closest(".section");
        const section = document.createElement("div");
        section.className = "section";

        const header = document.createElement("div");
        header.className = "lyrics-line section-label";
        const handle = document.createElement("i");
        handle.className = "fas fa-grip-lines drag-handle";
        header.appendChild(handle);
        const labelSpan = document.createElement("span");
        labelSpan.className = "section-label-text";
        labelSpan.textContent = text;
        labelSpan.setAttribute("contenteditable", !this.isReadOnly);
        labelSpan.addEventListener("input", () => this.handleLyricsInput());
        header.appendChild(labelSpan);
        header.addEventListener("click", (e) => {
          if (!e.target.classList.contains("drag-handle")) {
            section.classList.toggle("collapsed");
          }
        });
        section.appendChild(header);

        const content = document.createElement("div");
        content.className = "section-content";
        section.appendChild(content);

        let next = lineGroup.nextSibling;
        const container = lineGroup.parentElement;
        while (
          next &&
          next.classList &&
          next.classList.contains("lyrics-line-group")
        ) {
          const nextText = next
            .querySelector(".lyric-text")
            ?.textContent.trim();
          if (nextText && /^\[.*\]$/.test(nextText)) break;
          const temp = next;
          next = next.nextSibling;
          content.appendChild(temp);
        }

        if (parentSection) {
          this.lyricsDisplay.insertBefore(section, parentSection.nextSibling);
        } else {
          this.lyricsDisplay.insertBefore(section, lineGroup);
        }

        lineGroup.remove();
      });
      this.initSectionDrag();
    },

    findRhymes(lines) {
      const rhymeWords = lines.map((line) => {
        if (/^\[.*\]$/.test(line.trim())) return "";
        const words = line.trim().split(/\s+/);
        return words[words.length - 1] || "";
      });

      const rhymeGroups = {};
      let rhymeColorIndex = 0;
      const rhymeColors = {};

      const getRhymeKey = (word) => {
        const vowels = "aeiou";
        let lastVowelIndex = -1;
        for (let i = word.length - 1; i >= 0; i--) {
          if (vowels.includes(word[i])) {
            lastVowelIndex = i;
            break;
          }
        }
        return lastVowelIndex !== -1 ? word.substring(lastVowelIndex) : word;
      };

      for (let i = 0; i < rhymeWords.length; i++) {
        const word = rhymeWords[i].toLowerCase().replace(/[^a-z]/g, "");
        if (word.length < 2) continue;

        const rhymeKey = getRhymeKey(word);
        if (rhymeKey.length < 2) continue;

        for (let j = i + 1; j < rhymeWords.length; j++) {
          const nextWord = rhymeWords[j].toLowerCase().replace(/[^a-z]/g, "");
          const nextRhymeKey = getRhymeKey(nextWord);

          if (rhymeKey === nextRhymeKey) {
            if (!rhymeColors[rhymeKey]) {
              rhymeColorIndex++;
              rhymeColors[rhymeKey] = `rhyme-match-${rhymeColorIndex}`;
            }
            rhymeGroups[i] = rhymeColors[rhymeKey];
            rhymeGroups[j] = rhymeColors[rhymeKey];
          }
        }
      }
      return rhymeGroups;
    },

    handleLyricsInput() {
      this.hasUnsavedChanges = true;
      this.trimDomEmptyLines();
      this.convertBracketSections();
      this.autoNumberVerses();
      this.debouncedSaveCurrentSong && this.debouncedSaveCurrentSong();
    },

    handleLyricsClick(e) {
      if (
        e.target.classList.contains("lyrics-line") ||
        e.target.classList.contains("chord-line")
      ) {
        // Keep the cursor where it is
      }
    },

    handleLyricsKeydown(e) {
      if (e.key === "Enter" && e.target.classList.contains("lyric-text")) {
        e.preventDefault();
        const currentGroup = e.target.closest(".lyrics-line-group");
        const newGroup = this.addLyricLine(
          "",
          "",
          null,
          0,
          this.lyricsDisplay,
          currentGroup?.nextSibling,
        );
        const newText = newGroup.querySelector(".lyric-text");
        if (newText) newText.focus();
        this.handleLyricsInput();
        this.updateSyllableCount();
        this.updateRhymes();
      }
    },

    adjustFontSize(step) {
      this.fontSize = Math.max(
        this.minFontSize,
        Math.min(this.maxFontSize, this.fontSize + step),
      );
      this.perSongFontSizes[this.currentSong.id] = this.fontSize;
      localStorage.setItem(
        "perSongFontSizes",
        JSON.stringify(this.perSongFontSizes),
      );
      this.lyricsDisplay.style.fontSize = `${this.fontSize}px`;
      this.fontSizeDisplay.textContent = `${Math.round((this.fontSize / 16) * 100)}%`;
    },

    navigateSong(direction) {
      this.debouncedSaveCurrentSong && this.debouncedSaveCurrentSong();
      this.currentEditorSongIndex += direction;
      if (this.currentEditorSongIndex < 0) {
        this.currentEditorSongIndex = this.editorSongs.length - 1;
      } else if (this.currentEditorSongIndex >= this.editorSongs.length) {
        this.currentEditorSongIndex = 0;
      }
      this.displayCurrentEditorSong();
    },

    toggleTheme() {
      const currentTheme = document.documentElement.dataset.theme;
      const newTheme = currentTheme.includes("dark") ? "light" : "dark";
      document.documentElement.dataset.theme = newTheme;
      localStorage.setItem("theme", newTheme);
    },

    exitEditorMode() {
      if (this.hasUnsavedChanges) {
        if (
          confirm("You have unsaved changes. Are you sure you want to exit?")
        ) {
          this.saveCurrentSong(true);
        } else {
          return;
        }
      }
      if (this.resizeObserver) this.resizeObserver.disconnect();
      window.location.href = "../index.html";
    },

    scrollToTop() {
      this.lyricsEditorContainer.scrollTo({ top: 0, behavior: "smooth" });
    },

    toggleChords() {
      this.isChordsVisible = !this.isChordsVisible;
      this.updateChordsVisibility();
    },

    updateChordsVisibility() {
      const chordLines = this.lyricsDisplay.querySelectorAll(".chord-line");
      chordLines.forEach((line) => {
        line.classList.toggle("hidden", !this.isChordsVisible);
      });
      const icon = this.toggleChordsBtn?.querySelector("i");
      if (icon) {
        if (this.isChordsVisible) {
          icon.classList.remove("fa-eye-slash");
          icon.classList.add("fa-guitar");
        } else {
          icon.classList.remove("fa-guitar");
          icon.classList.add("fa-eye-slash");
        }
      }
    },

    toggleReadOnly() {
      this.isReadOnly = !this.isReadOnly;
      this.updateReadOnlyState();
      const icon = this.toggleReadOnlyBtn?.querySelector("i");
      if (icon) {
        if (this.isReadOnly) {
          icon.classList.remove("fa-lock-open");
          icon.classList.add("fa-lock");
        } else {
          icon.classList.remove("fa-lock");
          icon.classList.add("fa-lock-open");
        }
      }
    },

    updateReadOnlyState() {
      const mode = this.editMode;
      const isReadOnly = this.isReadOnly;
      this.lyricsDisplay.querySelectorAll(".lyric-text").forEach((line) => {
        const editable = !isReadOnly && (mode === "lyrics" || mode === "both");
        line.setAttribute("contenteditable", editable);
        line.classList.toggle("editable", editable);
        line.classList.toggle("non-editable", !editable);
      });
      this.lyricsDisplay.querySelectorAll(".chord-line").forEach((line) => {
        const editable = !isReadOnly && (mode === "chords" || mode === "both");
        line.setAttribute("contenteditable", editable);
        line.classList.toggle("editable", editable);
        line.classList.toggle("non-editable", !editable);
      });
      this.lyricsDisplay
        .querySelectorAll(".section-label-text")
        .forEach((label) => {
          const editable = !isReadOnly;
          label.setAttribute("contenteditable", editable);
          label.classList.toggle("editable", editable);
          label.classList.toggle("non-editable", !editable);
        });
      this.lyricsEditorContainer?.classList.toggle("read-only", isReadOnly);
    },

    async handleCopySelection(e) {
      if (!e.target.dataset.copyType) return;

      const copyType = e.target.dataset.copyType;
      let textToCopy = "";

      if (copyType === "download") {
        const content = ClipboardManager.formatSongForExport(
          this.currentSong,
          true,
        );
        const blob = new Blob([content], { type: "text/plain" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${this.currentSong.title.replace(/\s+/g, "_")}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      switch (copyType) {
        case "raw":
          textToCopy = this.currentSong.lyrics || "";
          break;
        case "chords":
          textToCopy = ClipboardManager.formatLyricsWithChords(
            this.currentSong.lyrics,
            this.currentSong.chords,
          );
          break;
        case "formatted":
          textToCopy = ClipboardManager.formatSongForExport(
            this.currentSong,
            true,
          );
          break;
        case "metadata":
          textToCopy = `${this.currentSong.title}\nKey: ${this.currentSong.key || "N/A"}\nTempo: ${this.currentSong.tempo} BPM\nTime: ${this.currentSong.timeSignature}\nTags: ${this.currentSong.tags?.join(", ") || "None"}`;
          break;
        default:
          textToCopy = this.currentSong.lyrics || "";
      }

      await ClipboardManager.copyToClipboard(textToCopy);
    },
  };

  app.init();

  document.getElementById("copy-lyrics-btn")?.addEventListener("click", () => {
    document.getElementById("editor-modal")?.classList.remove("visible");
    document.getElementById("copy-modal")?.classList.add("visible");
  });
  document.querySelectorAll(".modal-copy-btn")?.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const type = e.currentTarget.dataset.copyType;
      await app.handleCopySelection({
        target: { dataset: { copyType: type } },
      });
      document.getElementById("copy-modal")?.classList.remove("visible");
    });
  });
  document
    .querySelector("#copy-modal .close-modal-btn")
    ?.addEventListener("click", () => {
      document.getElementById("copy-modal")?.classList.remove("visible");
    });

  document.getElementById("editor-menu-btn")?.addEventListener("click", () => {
    document.getElementById("editor-modal")?.classList.add("visible");
  });
  document
    .querySelector("#editor-modal .close-modal-btn")
    ?.addEventListener("click", () => {
      document.getElementById("editor-modal")?.classList.remove("visible");
    });

  document.getElementById("ai-tools-btn")?.addEventListener("click", () => {
    document.getElementById("ai-tools-modal")?.classList.add("visible");
  });
  document
    .querySelector("#ai-tools-modal .close-modal-btn")
    ?.addEventListener("click", () => {
      document.getElementById("ai-tools-modal")?.classList.remove("visible");
    });
  document.querySelectorAll("#ai-tools-modal .tool-option")?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.prompt;
      const song = app.currentSong || {};
      const lyrics = song.lyrics || "";
      const style = song.tags?.join(", ") || "a popular style";
      let promptText = "";
      let append = false;
      switch (action) {
        case "Generate First Draft":
          promptText = `Write a complete first draft of song lyrics in ${style} with chord suggestions. Return chords and lyrics on alternating lines with section labels in square brackets.`;
          break;
        case "Polish Lyrics":
          promptText = `Polish the following lyrics for flow, rhyme, and clarity and suggest suitable chords. Return chords and lyrics on alternating lines with section labels in square brackets.\n${lyrics}`;
          break;
        case "Rewrite in Different Style":
          const styleInput = prompt("Rewrite in which style?");
          if (!styleInput) return;
          promptText = `Rewrite these lyrics in the style of ${styleInput} with chord suggestions. Return chords and lyrics on alternating lines with section labels in square brackets.\n${lyrics}`;
          break;
        case "Continue Song":
          promptText = `Continue the song after these lyrics, adding chord suggestions. Return chords and lyrics on alternating lines with section labels in square brackets.\n${lyrics}`;
          append = true;
          break;
        case "Suggest Chords":
          promptText = `Suggest chord progressions for the following lyrics. Return chords and lyrics on alternating lines with section labels in square brackets.\n${lyrics}`;
          break;
        default:
          promptText = action;
      }
      app.callOpenRouter(promptText, append);
      document.getElementById("ai-tools-modal")?.classList.remove("visible");
    });
  });

  window.app = app;
  });
});
