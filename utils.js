"use strict";
window.App = window.App || {};
App.Utils = (() => {
  const DEBUG = !!(window.App && App.Config && App.Config.DEBUG);
  const log = (...a) => {
    if (DEBUG) console.log("[App]", ...a);
  };
  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
  // Text helpers
  const compactBlankLines = (text = "") => {
    const out = [];
    let prevEmpty = false;
    for (const line of String(text).split("\n")) {
      const empty = line.trim() === "";
      if (!(empty && prevEmpty)) out.push(line);
      prevEmpty = empty;
    }
    return out.join("\n");
  };
  const splitChordLyric = (lyrics = "", chords = "") => {
    const L = String(lyrics).split("\n");
    const C = String(chords || "").split("\n");
    const max = Math.max(L.length, C.length);
    while (C.length < max) C.push("");
    while (L.length < max) L.push("");
    return { L, C };
  };
  const stripTitleLine = (lyrics = "", title = "") => {
    const lines = String(lyrics).split("\n");
    const norm = String(title || "").trim().toLowerCase();
    if (lines.length && lines[0].trim().toLowerCase() === norm) {
      lines.shift();
      if (lines[0]?.trim() === "") lines.shift();
    }
    return lines.join("\n");
  };

  // ---- Data migrations ----
  const ensureUniqueIds = (songs = [], setlists = []) => {
    const used = new Set();
    const idMap = {};
    const outSongs = songs.map((s) => ({ ...s }));
    for (const s of outSongs) {
      const old = s.id;
      if (!old || used.has(String(old))) {
        const nid = genId();
        if (old) idMap[String(old)] = nid;
        s.id = nid;
      }
      used.add(String(s.id));
    }
    if (Object.keys(idMap).length === 0) return { songs: outSongs, setlists, changed: 0 };
    const outSetlists = (setlists || []).map((sl) => ({
      ...sl,
      songs: Array.isArray(sl.songs)
        ? sl.songs.map((sid) => idMap[String(sid)] || sid)
        : [],
    }));
    return { songs: outSongs, setlists: outSetlists, changed: Object.keys(idMap).length };
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

  // ---- Shared song/lyric utilities ----
  const cleanAIOutput = (text = "") => {
    return String(text)
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/^\s+|\s+$/g, "")
      .replace(/^(Verse|Chorus|Bridge|Outro)[^\n]*$/gim, "[$1]")
      .replace(/^#+\s*/gm, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^(Capo|Key|Tempo|Time Signature).*$/gim, "")
      .trim();
  };

  const normalizeSectionLabels = (text = "") => {
    const sectionKeywords = [
      "intro",
      "verse",
      "prechorus",
      "chorus",
      "bridge",
      "outro",
      "hook",
      "refrain",
      "coda",
      "solo",
      "interlude",
      "ending",
      "breakdown",
      "tag",
    ];
    return String(text)
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        const match = trimmed.match(/^[\*\s\-_=~`]*[\(\[\{]?\s*([^\]\)\}]+?)\s*[\)\]\}]?[\*\s\-_=~`]*:?$/);
        if (match) {
          const label = match[1].trim();
          const normalized = label.toLowerCase().replace(/[^a-z]/g, "");
          if (sectionKeywords.some((k) => normalized.startsWith(k))) {
            const formatted = label
              .replace(/\s+/g, " ")
              .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
            return `[${formatted}]`;
          }
        }
        return line;
      })
      .join("\n");
  };

  const enforceAlternating = (linesOrLyrics = "", chords = "", chordPrefix = "") => {
    // Overloaded: if first arg is array of lines from AI output, split into chords/lyrics alternating
    if (Array.isArray(linesOrLyrics)) {
      const chordsOut = [];
      const lyricsOut = [];
      for (let i = 0; i < linesOrLyrics.length; i++) {
        if (i % 2 === 0) chordsOut.push(linesOrLyrics[i] || "");
        else lyricsOut.push(linesOrLyrics[i] || "");
      }
      return { chords: chordsOut, lyrics: lyricsOut };
    }
    // Else, combine parallel lyrics/chords into alternating text
    const L = String(linesOrLyrics).split("\n");
    const C = String(chords || "").split("\n");
    const out = [];
    const max = Math.max(L.length, C.length);
    for (let i = 0; i < max; i++) {
      const c = C[i] || "";
      const l = L[i] || "";
      if (c.trim()) out.push(`${chordPrefix ? chordPrefix + " " : ""}${c}`.trim());
      if (l.trim()) out.push(l);
      if (!c.trim() && !l.trim()) out.push("");
    }
    return out.join("\n");
  };

  // ---- Clipboard utilities ----
  const ClipboardManager = {
    async copyToClipboard(text, showToast = true) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          textArea.style.top = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          textArea.remove();
        }
        if (showToast) ClipboardManager.showToast("Copied to clipboard!", "success");
        return true;
      } catch (err) {
        console.error("Failed to copy:", err);
        if (showToast) ClipboardManager.showToast("Failed to copy to clipboard", "error");
        return false;
      }
    },
    showToast(message, type = "info") {
      let container = document.querySelector(".toast-container");
      if (!container) {
        container = document.createElement("div");
        container.className = "toast-container";
        document.body.appendChild(container);
      }
      const toast = document.createElement("div");
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.classList.add("show"), 10);
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    },
    formatLyricsWithChords(lyrics, chords) {
      const lyricLines = String(lyrics || "").split("\n");
      const chordLines = String(chords || "").split("\n");
      return lyricLines
        .map((lyricLine, i) => {
          const chordLine = chordLines[i] || "";
          return chordLine.trim() ? `${chordLine}\n${lyricLine}` : lyricLine;
        })
        .join("\n");
    },
    formatSongForExport(song, includeMetadata = true) {
      let output = "";
      if (includeMetadata) {
        output += `# ${song.title}\n\n`;
        if (song.key) output += `**Key:** ${song.key}\n`;
        if (song.tempo) output += `**Tempo:** ${song.tempo} BPM\n`;
        if (song.timeSignature) output += `**Time Signature:** ${song.timeSignature}\n`;
        if (song.tags && song.tags.length > 0) output += `**Tags:** ${song.tags.join(", ")}\n`;
        output += "\n---\n\n";
      }
      if (song.chords && String(song.chords).trim()) {
        output += ClipboardManager.formatLyricsWithChords(song.lyrics, song.chords);
      } else {
        output += song.lyrics || "";
      }
      if (song.notes && String(song.notes).trim()) {
        output += "\n\n---\n**Notes:**\n" + song.notes;
      }
      return output;
    },
  };
  return { log, safeParse, once, normalizeSetlistName, cleanAIOutput, normalizeSectionLabels, enforceAlternating, ClipboardManager, genId, ensureUniqueIds, compactBlankLines, splitChordLyric, stripTitleLine };
})();
