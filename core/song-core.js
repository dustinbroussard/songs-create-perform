/* core/song-core.js */
;(()=> {
  const SCHEMA_VERSION = 2;

  const DEFAULT_SONG = Object.freeze({
    id: null,
    title: '',
    lyrics: '',
    chords: '',             // optional parallel chord lines
    key: '',                // e.g. "C", "Gm"
    tempo: '',              // bpm as string or number
    timeSignature: '',      // e.g. "4/4"
    tags: [],               // ["blues","cover"]
    notes: '',              // freeform performance/arrangement notes
    createdAt: 0,
    lastEditedAt: 0,
    schemaVersion: SCHEMA_VERSION,
  });

  // ---------- TEXT / LYRIC UTILITIES ----------
  function cleanAIOutput(text='') {
    return String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/^#+\s*/gm, '')           // strip markdown headers
      .replace(/```[\s\S]*?```/g, '')    // remove code fences
      .trim();
  }

  function compactBlankLines(text='') {
    const out=[]; let prevEmpty=false;
    for (const line of String(text).split('\n')) {
      const empty = line.trim()==='';
      if (!(empty && prevEmpty)) out.push(line);
      prevEmpty = empty;
    }
    return out.join('\n');
  }

  function normalizeSectionLabels(text='') {
    const keys = ['intro','verse','prechorus','chorus','bridge','outro','hook','refrain','coda','solo','interlude','ending','breakdown','tag'];
    return String(text).split('\n').map(line=>{
      const t=line.trim(); if(!t) return line;
      const m=t.match(/^[\*\s\-_=~`]*[\(\[\{]?\s*([^\]\)\}]+?)\s*[\)\]\}]?[\*\s\-_=~`]*:?$/);
      if(!m) return line;
      const label=m[1].trim(); const norm=label.toLowerCase().replace(/[^a-z]/g,'');
      if(keys.some(k=>norm.startsWith(k))){
        const formatted=label.replace(/\s+/g,' ').replace(/(^|\s)\S/g,c=>c.toUpperCase());
        return `[${formatted}]`;
      }
      return line;
    }).join('\n');
  }

  // Keep lyric/chord lines aligned. Pads the shorter side.
  function splitChordLyric(lyrics='', chords='') {
    const L=String(lyrics).split('\n'); const C=String(chords||'').split('\n');
    const max=Math.max(L.length,C.length);
    while(C.length<max) C.push('');
    while(L.length<max) L.push('');
    return { L, C };
  }

  // Optionally enforce alternating “chord line → lyric line”
  function enforceAlternating(lyrics='', chords='', chordPrefix='~') {
    const { L, C } = splitChordLyric(lyrics, chords);
    const out=[];
    for (let i=0;i<L.length;i++){
      const c=C[i]; const l=L[i];
      if (c?.trim()) out.push(`${chordPrefix} ${c}`.trim());
      if (l?.trim()) out.push(l);
      if (!c?.trim() && !l?.trim()) out.push('');
    }
    return compactBlankLines(out.join('\n'));
  }

  function stripTitleLine(lyrics, title){
    const lines=String(lyrics).split('\n');
    const norm=(title||'').trim().toLowerCase();
    if(lines.length && lines[0].trim().toLowerCase()===norm){
      lines.shift(); if(lines[0]?.trim()==='') lines.shift();
    }
    return lines.join('\n');
  }

  // ---------- CLIPBOARD ----------
  const ClipboardManager = {
    async copy(text){
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fallback
        const ta=document.createElement('textarea');
        ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); return true; }
        catch { return false; }
        finally { document.body.removeChild(ta); }
      }
    }
  };

  // ---------- STORAGE ----------
  const DB = {
    keys: Object.freeze({
      songs: (typeof App !== 'undefined' && App.Config && App.Config.STORAGE && App.Config.STORAGE.SONGS) ? App.Config.STORAGE.SONGS : 'songs',
      setlists: (typeof App !== 'undefined' && App.Config && App.Config.STORAGE && App.Config.STORAGE.SETLISTS) ? App.Config.STORAGE.SETLISTS : 'setlists'
    }),

    loadSongs(){
      try { return JSON.parse(localStorage.getItem(DB.keys.songs) || '[]'); }
      catch { return []; }
    },
    saveSongs(list){
      localStorage.setItem(DB.keys.songs, JSON.stringify(list||[]));
    },

    loadSetlists(){
      try { return JSON.parse(localStorage.getItem(DB.keys.setlists) || '[]'); }
      catch { return []; }
    },
    saveSetlists(list){
      localStorage.setItem(DB.keys.setlists, JSON.stringify(list||[]));
    },
  };

  // ---------- MIGRATIONS ----------
  function migrateSong(input){
    const s = { ...DEFAULT_SONG, ...input };
    s.id = s.id || (Date.now().toString(36)+Math.random().toString(36).slice(2));
    s.title = (s.title||'').trim();
    s.lyrics = cleanAIOutput(s.lyrics||'');
    s.chords = cleanAIOutput(s.chords||'');
    s.tags = Array.isArray(s.tags) ? s.tags : (s.tags?String(s.tags).split(',').map(t=>t.trim()).filter(Boolean):[]);
    s.createdAt = Number(s.createdAt)||Date.now();
    s.lastEditedAt = Date.now();
    s.schemaVersion = SCHEMA_VERSION;
    return s;
  }

  function migrateAllSongs(list){
    return (list||[]).map(migrateSong);
  }

  // ---------- EXPORT ----------
  const SongCore = {
    SCHEMA_VERSION,
    DEFAULT_SONG,
    cleanAIOutput,
    compactBlankLines,
    normalizeSectionLabels,
    splitChordLyric,
    enforceAlternating,
    stripTitleLine,
    ClipboardManager,
    DB,
    migrateSong,
    migrateAllSongs,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SongCore;
  else window.SongCore = SongCore;
})();
