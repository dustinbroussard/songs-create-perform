document.addEventListener('DOMContentLoaded', () => {
    const { safeParse, log, once } = App.Utils || { safeParse: (s)=>{try{return JSON.parse(s);}catch{return null;}}, log: ()=>{}, once: null };
    const init = () => {
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
    const app = {
        // DOM Elements
        performanceMode: document.getElementById('performance-mode'),
        performanceSongInfo: document.getElementById('performance-song-info'),
        lyricsDisplay: document.getElementById('lyrics-display'),
        decreaseFontBtn: document.getElementById('decrease-font-btn'),
        increaseFontBtn: document.getElementById('increase-font-btn'),
        fontSizeDisplay: document.getElementById('font-size-display'),
        footerDecreaseFontBtn: document.getElementById('footer-decrease-font-btn'),
        footerIncreaseFontBtn: document.getElementById('footer-increase-font-btn'),
        footerFontSizeDisplay: document.getElementById('footer-font-size-display'),
        toggleThemeBtn: document.getElementById('footer-theme-toggle-btn') || document.getElementById('theme-toggle-btn'),
        exitPerformanceBtn: document.getElementById('footer-exit-performance-btn') || document.getElementById('exit-performance-btn'),
        prevSongBtn: document.getElementById('prev-song-btn'),
        nextSongBtn: document.getElementById('next-song-btn'),
        scrollToTopBtn: document.getElementById('scroll-to-top-btn'),
        autoScrollBtn: document.getElementById('auto-scroll-btn'),
        autoscrollSettingsBtn: document.getElementById('footer-autoscroll-settings-btn') || document.getElementById('autoscroll-settings-btn'),
        autoscrollDelayModal: document.getElementById('autoscroll-delay-modal'),
        autoscrollDelaySlider: document.getElementById('autoscroll-delay-slider'),
        autoscrollDelayValue: document.getElementById('autoscroll-delay-value'),
        autoscrollSpeedSlider: document.getElementById('autoscroll-speed-slider'),
        autoscrollSpeedValue: document.getElementById('autoscroll-speed-value'),
        closeAutoscrollDelayModal: document.getElementById('close-autoscroll-delay-modal'),

        perfMenuBtn: document.getElementById('footer-perf-menu-btn') || document.getElementById('perf-menu-btn'),
        perfMenuModal: document.getElementById('performance-menu-modal'),
        perfMenuClose: document.getElementById('perf-menu-close'),
        perfEditModeSelect: document.getElementById('perf-edit-mode'),
        perfChordModeSelect: document.getElementById('perf-chord-mode'),
        perfNormalizeBtn: document.getElementById('perf-normalize-btn'),
        perfMetadataBtn: document.getElementById('perf-metadata-btn'),
        perfMetadataModal: document.getElementById('perf-metadata-modal'),
        perfMetadataSave: document.getElementById('perf-metadata-save'),
        perfMetadataClose: document.getElementById('perf-metadata-close'),
        perfKey: document.getElementById('perf-key'),
        perfTempo: document.getElementById('perf-tempo'),
        perfTS: document.getElementById('perf-ts'),
        perfTags: document.getElementById('perf-tags'),
        perfNotes: document.getElementById('perf-notes'),

        // State
        songs: [],
        performanceSetlistId: null,
        autoFitManuallyOverridden: false,
        performanceSongs: [],
        currentPerformanceSongIndex: 0,
        isPerformanceMode: true,
        autoScrollTimer: null,
        autoScrollDelayTimer: null,
        autoScrollSpeed: Number(localStorage.getItem('autoscrollSpeed')) || 1,
        autoScrollActive: false,
        autoscrollDelay: Number(localStorage.getItem('autoscrollDelay')) || 3,
        resizeObserver: null,

        editMode: localStorage.getItem('perfEditMode') || 'readonly',
        chordMode: localStorage.getItem('perfChordMode') || 'off',

        fontSize: 32, // default value; will set per song
        perSongFontSizes: safeParse(localStorage.getItem('perSongFontSizes'), {}),
        perSongAutoScroll: safeParse(localStorage.getItem('perSongAutoScroll'), {}),
        minFontSize: 8,
        maxFontSize: 72,
        fontSizeStep: 1,

        normalizeSectionLabels(text='') {
          const keys = ['intro','verse','prechorus','chorus','bridge','outro','hook','refrain','coda','solo','interlude','ending','breakdown','tag'];
          return text.split(/\r?\n/).map(line=>{
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
        },
        cleanText(text=''){ return text
          .replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n')
          .replace(/[ \t]+$/gm,'').replace(/^\s+|\s+$/g,'')
          .replace(/^(Verse|Chorus|Bridge|Outro)[^\n]*$/gmi,'[$1]')
          .replace(/^#+\s*/gm,'').replace(/```[\s\S]*?```/g,'')
          .trim();
        },
        stripTitleLine(lyrics, title){
          const lines=lyrics.split('\n'); const norm=(title||'').trim().toLowerCase();
          if(lines.length && lines[0].trim().toLowerCase()===norm){
            lines.shift(); if(lines[0]?.trim()==='') lines.shift();
          }
          return lines.join('\n');
        },
        splitChordLyric(lyrics='', chords=''){
          const L=lyrics.split('\n'); const C=chords.split('\n');
          const max=Math.max(L.length,C.length);
          while(C.length<max) C.push('');
          while(L.length<max) L.push('');
          return {L,C};
        },
        compactBlankLines(text=''){
          const out=[]; let prevEmpty=false;
          for(const line of text.split('\n')){
            const empty=line.trim()==='';
            if(!(empty && prevEmpty)) out.push(line);
            prevEmpty = empty;
          }
          return out.join('\n');
        },

        // Initialize
        init() {
            this.loadData();
            if (this.perfEditModeSelect) this.perfEditModeSelect.value = this.editMode;
            if (this.perfChordModeSelect) this.perfChordModeSelect.value = this.chordMode;
            this.setupEventListeners();
            this.loadPerformanceState();
            this.displayCurrentPerformanceSong();
            this.setupResizeObserver();
        },

        // Setup resize observer for auto-fit (unchanged)
        setupResizeObserver() {
            if (window.ResizeObserver) {
                this.resizeObserver = new ResizeObserver(() => {
                    if (!this.autoFitManuallyOverridden) {
                        clearTimeout(this.resizeTimeout);
                        this.resizeTimeout = setTimeout(() => {
                            // Optionally, you could auto-fit here if you want
                        }, 100);
                    }
                });
                this.resizeObserver.observe(this.performanceMode);
            }
        },

        // Load data from localStorage
        loadData() {
            const raw = localStorage.getItem('songs');
            this.songs = safeParse(raw, []);
            const theme = localStorage.getItem('theme') || 'default-dark';
            document.documentElement.dataset.theme = theme;
        },

        // Load performance state from query parameters
        loadPerformanceState() {
            const params = new URLSearchParams(window.location.search);
            this.performanceSetlistId = params.get('setlistId') || null;
            const songId = params.get('songId');
            if (this.performanceSetlistId) {
                const setlistRaw = localStorage.getItem('setlists');
                if (setlistRaw) {
                    const setlists = safeParse(setlistRaw, []);
                    const setlist = setlists.find(s => s.id === this.performanceSetlistId);
                    if (setlist) {
                        this.performanceSongs = setlist.songs
                            .map(id => this.songs.find(s => s.id === id))
                            .filter(Boolean);
                    }
                }
            } else {
                this.performanceSongs = this.songs;
            }
            this.currentPerformanceSongIndex = songId
                ? this.performanceSongs.findIndex(s => s.id === songId)
                : 0;
            if (this.currentPerformanceSongIndex === -1) {
                this.currentPerformanceSongIndex = 0;
            }
            this.maybeResumeSetlist();
        },

        maybeResumeSetlist() {
            const lastPerfRaw = localStorage.getItem('lastPerformance');
            const lastPerf = safeParse(lastPerfRaw, null);
            // Only prompt if we're entering the SAME setlist as before, and it wasn't at the beginning
            if (
                lastPerf &&
                lastPerf.setlistId &&
                lastPerf.setlistId === this.performanceSetlistId &&
                typeof lastPerf.songIndex === "number" &&
                lastPerf.songIndex > 0 &&
                this.performanceSongs[lastPerf.songIndex]
            ) {
                const resume = confirm(
                    "Resume this setlist where we left off? (Song " +
                    (lastPerf.songIndex + 1) +
                    ": " +
                    (this.performanceSongs[lastPerf.songIndex]?.title || "Unknown") +
                    ")\n\nPress OK to resume, or Cancel to start from the beginning."
                );
                if (resume) {
                    this.currentPerformanceSongIndex = lastPerf.songIndex;
                } else {
                    this.currentPerformanceSongIndex = 0;
                }
            } else {
                this.currentPerformanceSongIndex = 0;
            }
        },

        // Setup event listeners
        setupEventListeners() {
            // FONT SIZE BUTTONS
            this.decreaseFontBtn?.addEventListener('click', () => this.adjustFontSize(-this.fontSizeStep));
            this.increaseFontBtn?.addEventListener('click', () => this.adjustFontSize(this.fontSizeStep));
            this.footerDecreaseFontBtn?.addEventListener('click', () => this.adjustFontSize(-this.fontSizeStep));
            this.footerIncreaseFontBtn?.addEventListener('click', () => this.adjustFontSize(this.fontSizeStep));

            this.toggleThemeBtn?.addEventListener('click', () => this.handlePerformanceThemeToggle());
            this.exitPerformanceBtn?.addEventListener('click', () => this.exitPerformanceMode());
            this.prevSongBtn?.addEventListener('click', () => this.navigatePerformanceSong(-1));
            this.nextSongBtn?.addEventListener('click', () => this.navigatePerformanceSong(1));
            this.scrollToTopBtn?.addEventListener('click', () => {
                this.lyricsDisplay.scrollTo({ top: 0, behavior: 'smooth' });
            });
            this.autoScrollBtn?.addEventListener('click', () => this.toggleAutoScroll());
            this.autoscrollSettingsBtn?.addEventListener('click', () => {
                this.autoscrollDelayModal.classList.add('is-open');
                this.autoscrollDelaySlider.value = this.autoscrollDelay;
                this.autoscrollDelayValue.textContent = this.autoscrollDelay + 's';
                this.autoscrollSpeedSlider.value = this.autoScrollSpeed;
                this.autoscrollSpeedValue.textContent = this.autoScrollSpeed;
            });
            this.autoscrollDelaySlider?.addEventListener('input', (e) => {
                this.autoscrollDelayValue.textContent = e.target.value + 's';
            });
            this.autoscrollSpeedSlider?.addEventListener('input', (e) => {
                this.autoscrollSpeedValue.textContent = e.target.value;
            });
            this.closeAutoscrollDelayModal?.addEventListener('click', () => {
                this.autoscrollDelay = Number(this.autoscrollDelaySlider.value);
                localStorage.setItem('autoscrollDelay', this.autoscrollDelay);
                this.autoScrollSpeed = Number(this.autoscrollSpeedSlider.value);
                localStorage.setItem('autoscrollSpeed', this.autoScrollSpeed);
                const song = this.performanceSongs[this.currentPerformanceSongIndex];
                if (song && song.id) {
                    const settings = this.perSongAutoScroll[song.id] || {};
                    settings.delay = this.autoscrollDelay;
                    settings.speed = this.autoScrollSpeed;
                    settings.active = this.autoScrollActive;
                    this.perSongAutoScroll[song.id] = settings;
                    localStorage.setItem('perSongAutoScroll', JSON.stringify(this.perSongAutoScroll));
                }
                this.autoscrollDelayModal.classList.remove('is-open');
            });
            this.lyricsDisplay.addEventListener('scroll', () => this.updateScrollButtonsVisibility());
            this.lyricsDisplay.addEventListener('touchstart', () => this.stopAutoScroll());
            this.lyricsDisplay.addEventListener('mousedown', () => this.stopAutoScroll());
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.stopAutoScroll();
            });

            this.perfMenuBtn?.addEventListener('click', ()=> this.perfMenuModal.classList.add('is-open'));
            this.perfMenuClose?.addEventListener('click', ()=> this.perfMenuModal.classList.remove('is-open'));

            this.perfEditModeSelect?.addEventListener('change', (e)=>{
              this.editMode = e.target.value;
              localStorage.setItem('perfEditMode', this.editMode);
              this.applyEditMode();
            });

            this.perfChordModeSelect?.addEventListener('change', (e)=>{
              this.chordMode = e.target.value;
              localStorage.setItem('perfChordMode', this.chordMode);
              this.displayCurrentPerformanceSong();
            });

            this.perfNormalizeBtn?.addEventListener('click', ()=>{
              this.normalizeCurrentSong();
            });

            this.perfMetadataBtn?.addEventListener('click', ()=>{
              this.openMetadata();
            });

            this.perfMetadataSave?.addEventListener('click', ()=>{
              this.saveMetadata();
              this.perfMetadataModal.classList.remove('is-open');
              this.updateHeaderMetaLine();
            });

            this.perfMetadataClose?.addEventListener('click', ()=>{
              this.perfMetadataModal.classList.remove('is-open');
            });

            document.addEventListener('keydown', (e)=>{
              if(e.key==='Escape'){
                if(this.autoscrollDelayModal?.classList.contains('is-open')) this.autoscrollDelayModal.classList.remove('is-open');
                if(this.perfMenuModal?.classList.contains('is-open')) this.perfMenuModal.classList.remove('is-open');
                if(this.perfMetadataModal?.classList.contains('is-open')) this.perfMetadataModal.classList.remove('is-open');
              }
            });
        },

        // Display current song
        displayCurrentPerformanceSong() {
            const song = this.performanceSongs[this.currentPerformanceSongIndex];
            if (!song) {
                this.lyricsDisplay.innerHTML = '<p class="empty-state">Pick a song to see performance tips.</p>';
                this.performanceSongInfo.innerHTML = '';
                return;
            }

            this.autoFitManuallyOverridden = false; // Reset override for new song

            // Process lyrics
            let lines = song.lyrics.split('\n').map(line => line.trim());
            const normTitle = song.title.trim().toLowerCase();
            let removed = 0;
            while (lines.length && removed < 2) {
                if (!lines[0] || lines[0].toLowerCase() === normTitle) {
                    lines.shift(); removed++;
                } else break;
            }

            const songNumber = this.currentPerformanceSongIndex + 1;
            const totalSongs = this.performanceSongs.length;
            this.performanceSongInfo.innerHTML = `
                <h2>${song.title}</h2>
                <div class="song-progress">${songNumber} / ${totalSongs}</div>
            `;
		    
            song.lyrics = lines.join('\n');
            this.renderLyrics();
            this.updateHeaderMetaLine();

        // Restore per-song font size if present, else use last-used or default
            let fs = this.perSongFontSizes[song.id];
	    if (typeof fs !== 'number') {
	    // fallback to previous fontSize or default
	         fs = this.fontSize || 32;
	    }
	    this.fontSize = fs;
	    this.updateFontSize();

            this.prevSongBtn.style.display = this.currentPerformanceSongIndex > 0 ? 'block' : 'none';
            this.nextSongBtn.style.display = this.currentPerformanceSongIndex < this.performanceSongs.length - 1 ? 'block' : 'none';

            // Restore per-song autoscroll settings
            this.stopAutoScroll(true);
            const auto = this.perSongAutoScroll[song.id];
            if (auto) {
                if (typeof auto.delay === 'number') this.autoscrollDelay = auto.delay;
                if (typeof auto.speed === 'number') this.autoScrollSpeed = auto.speed;
                if (auto.active) this.startAutoScroll();
            } else {
                this.autoscrollDelay = Number(localStorage.getItem('autoscrollDelay')) || 3;
                this.autoScrollSpeed = Number(localStorage.getItem('autoscrollSpeed')) || 1;
            }
            this.updateAutoScrollButton();
            this.autoScrollBtn.blur();
        },

        renderLyrics(){
          const song = this.performanceSongs[this.currentPerformanceSongIndex];
          if(!song) return;

          const title = song.title || '';
          const lyricsNorm = this.normalizeSectionLabels( this.cleanText( this.stripTitleLine(song.lyrics||'', title) ) );
          const chordsClean = this.compactBlankLines((song.chords||'').replace(/\r\n/g,'\n'));
          const {L, C} = this.splitChordLyric(lyricsNorm, chordsClean);

          this.lyricsDisplay.innerHTML = '';
          const frag = document.createDocumentFragment();

          let currentSection = null;
          for(let i=0;i<L.length;i++){
            const line = L[i]||'';

            if(/^\[.+\]$/.test(line.trim())){
              const section = document.createElement('div');
              section.className='section';
              const header = document.createElement('div');
              header.className='lyrics-line section-label';
              const label = document.createElement('span');
              label.className='section-label-text';
              label.textContent=line.trim();
              header.appendChild(label);
              section.appendChild(header);
              frag.appendChild(section);
              currentSection = document.createElement('div');
              currentSection.className='section-content';
              section.appendChild(currentSection);
              continue;
            }

            const group = document.createElement('div');
            group.className='lyrics-line-group';

            const chordText = C[i]||'';
            const chordEl = document.createElement('div');
            chordEl.className='chord-line';
            chordEl.textContent = chordText;

            const lyricEl = document.createElement('div');
            lyricEl.className='lyric-text';
            lyricEl.textContent = line;

            const mode=this.chordMode;
            chordEl.style.display = (mode==='off'||mode==='lyrics') ? 'none' : 'block';
            lyricEl.style.display = (mode==='chords') ? 'none' : 'block';

            chordEl.addEventListener('input', ()=> this.persistEditsFromDOM());
            lyricEl.addEventListener('input', ()=> this.persistEditsFromDOM());

            group.appendChild(chordEl);
            group.appendChild(lyricEl);
            (currentSection || frag).appendChild(group);
          }

          this.lyricsDisplay.appendChild(frag);
          this.applyEditMode();
          setTimeout(()=> this.updateScrollButtonsVisibility(), 100);
        },

        applyEditMode(){
          const container = this.lyricsDisplay;
          if(!container) return;
          container.querySelectorAll('[contenteditable]').forEach(n=> n.setAttribute('contenteditable','false'));
          if(this.editMode==='readonly') return;

          if(this.editMode==='lyrics' || this.editMode==='both'){
            container.querySelectorAll('.lyric-text').forEach(n=> n.setAttribute('contenteditable','true'));
          }
          if(this.editMode==='chords' || this.editMode==='both'){
            container.querySelectorAll('.chord-line').forEach(n=> n.setAttribute('contenteditable','true'));
          }
        },

        persistEditsFromDOM(){
          const song = this.performanceSongs[this.currentPerformanceSongIndex];
          if(!song) return;

          const lyricLines=[]; const chordLines=[];
          this.lyricsDisplay.querySelectorAll('.section, .lyrics-line-group').forEach(node=>{
            if(node.classList.contains('section')){
              const label = node.querySelector('.section-label-text')?.textContent || '';
              if(label.trim()) lyricLines.push(label.trim());
              node.querySelectorAll('.lyrics-line-group').forEach(group=>{
                const chord = group.querySelector('.chord-line')?.textContent ?? '';
                const lyric = group.querySelector('.lyric-text')?.textContent ?? '';
                chordLines.push(chord);
                lyricLines.push(lyric);
              });
            } else {
              const chord = node.querySelector('.chord-line')?.textContent ?? '';
              const lyric = node.querySelector('.lyric-text')?.textContent ?? '';
              chordLines.push(chord);
              lyricLines.push(lyric);
            }
          });

          let lyricsOut = this.normalizeSectionLabels( this.compactBlankLines(lyricLines.join('\n')) );
          let chordsOut = this.compactBlankLines(chordLines.join('\n'));

          song.lyrics = lyricsOut;
          song.chords = chordsOut;
          song.lastEditedAt = new Date().toISOString();

          const all = safeParse(localStorage.getItem('songs'), []);
          const idx = all.findIndex(s=> s.id===song.id);
          if(idx!==-1){ all[idx]=song; localStorage.setItem('songs', JSON.stringify(all)); }
        },

        normalizeCurrentSong(){
          const song = this.performanceSongs[this.currentPerformanceSongIndex];
          if(!song) return;
          let L = this.stripTitleLine(this.cleanText(song.lyrics||''), song.title||'');
          L = this.normalizeSectionLabels( this.compactBlankLines(L) );
          let C = this.compactBlankLines((song.chords||'').replace(/\r\n/g,'\n'));
          const Ls=L.split('\n'); const Cs=C.split('\n');
          const max=Math.max(Ls.length,Cs.length);
          while(Ls.length<max) Ls.push(''); while(Cs.length<max) Cs.push('');
          song.lyrics = Ls.join('\n');
          song.chords = Cs.join('\n');
          song.lastEditedAt = new Date().toISOString();
          const all = safeParse(localStorage.getItem('songs'), []);
          const idx = all.findIndex(s=> s.id===song.id);
          if(idx!==-1){ all[idx]=song; localStorage.setItem('songs', JSON.stringify(all)); }

          this.displayCurrentPerformanceSong();
        },

        openMetadata(){
          const song=this.performanceSongs[this.currentPerformanceSongIndex]; if(!song) return;
          this.perfKey.value = song.key || '';
          this.perfTempo.value = song.tempo || 120;
          this.perfTS.value = song.timeSignature || '4/4';
          this.perfTags.value = (song.tags||[]).join(', ');
          this.perfNotes.value = song.notes || '';
          this.perfMetadataModal.classList.add('is-open');
        },

        saveMetadata(){
          const song=this.performanceSongs[this.currentPerformanceSongIndex]; if(!song) return;
          song.key = this.perfKey.value || '';
          song.tempo = parseInt(this.perfTempo.value || '120',10);
          song.timeSignature = this.perfTS.value || '4/4';
          song.tags = this.perfTags.value.split(',').map(t=>t.trim()).filter(Boolean);
          song.notes = this.perfNotes.value || '';
          song.lastEditedAt = new Date().toISOString();
          const all = safeParse(localStorage.getItem('songs'), []);
          const idx = all.findIndex(s=> s.id===song.id);
          if(idx!==-1){ all[idx]=song; localStorage.setItem('songs', JSON.stringify(all)); }
        },

        updateHeaderMetaLine(){
          const song=this.performanceSongs[this.currentPerformanceSongIndex]; if(!song) return;
          const metaBits=[];
          if(song.key) metaBits.push(song.key);
          if(song.tempo) metaBits.push(`${song.tempo} BPM`);
          if(song.timeSignature && song.timeSignature!=='4/4') metaBits.push(song.timeSignature);
          let html = metaBits.join(' • ');
          if(song.notes && song.notes.trim()){
            html += ` <i id="perf-notes-icon" class="fas fa-info-circle notes-icon" title="Show notes"></i>`;
          }

          let metaLine = this.performanceSongInfo.querySelector('.song-meta-line');
          if(!metaLine){
            metaLine = document.createElement('div');
            metaLine.className='song-meta-line';
            this.performanceSongInfo.appendChild(metaLine);
          }
          metaLine.innerHTML = html || '';

          const icon = document.getElementById('perf-notes-icon');
          if(icon){
            icon.addEventListener('click', ()=>{
              alert(song.notes || 'No notes');
            });
          }
        },

        // Font size methods
	adjustFontSize(amount) {
	    this.fontSize = Math.max(this.minFontSize, Math.min(this.maxFontSize, this.fontSize + amount));
	    this.updateFontSize();
	    // Save font size for this song
	    const song = this.performanceSongs[this.currentPerformanceSongIndex];
	    if (song && song.id) {
		this.perSongFontSizes[song.id] = this.fontSize;
		localStorage.setItem('perSongFontSizes', JSON.stringify(this.perSongFontSizes));
	    }
	},

        updateFontSize() {
            if (this.lyricsDisplay) {
                this.lyricsDisplay.style.fontSize = this.fontSize + 'px';
            }
            if (this.fontSizeDisplay) {
                this.fontSizeDisplay.textContent = `${Math.round(this.fontSize)}px`;
            }
            if (this.footerFontSizeDisplay) {
                this.footerFontSizeDisplay.textContent = `${Math.round(this.fontSize)}px`;
            }
            setTimeout(() => this.updateScrollButtonsVisibility(), 100);
        },

        // Navigate to next/previous song
        navigatePerformanceSong(direction) {
            const newIndex = this.currentPerformanceSongIndex + direction;
            if (newIndex >= 0 && newIndex < this.performanceSongs.length) {
                this.stopAutoScroll();
                this.currentPerformanceSongIndex = newIndex;
                this.displayCurrentPerformanceSong();
            }
        },

        // Toggle theme
        handlePerformanceThemeToggle() {
            const currentTheme = document.documentElement.dataset.theme;
            const isDark = currentTheme.includes('dark');
            const newTheme = isDark ? currentTheme.replace('dark', 'light') : currentTheme.replace('light', 'dark');
            document.documentElement.dataset.theme = newTheme;
            localStorage.setItem('theme', newTheme);
        },

        // Exit performance mode
        exitPerformanceMode() {
            const perf = {
                setlistId: this.performanceSetlistId || null,
                songIndex: this.currentPerformanceSongIndex,
                timestamp: Date.now()
            };
            localStorage.setItem('lastPerformance', JSON.stringify(perf));
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
            }
            window.location.href = '../index.html#performance';
        },

        // The rest: autoscroll, buttons, etc. are unchanged from your original

        startAutoScroll() {
            this.stopAutoScroll();
            const container = this.lyricsDisplay;
            if (!container) return;
            if (container.scrollHeight <= container.clientHeight) return;

            this.autoScrollActive = true;
            this.autoScrollDelayTimer = setTimeout(() => {
                this.autoScrollTimer = setInterval(() => {
                    if (!this.autoScrollActive) return;
                    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
                        this.stopAutoScroll();
                        return;
                    }
                    container.scrollTop += this.autoScrollSpeed;
                }, 50);
            }, this.autoscrollDelay * 1000);
            const song = this.performanceSongs[this.currentPerformanceSongIndex];
            if (song && song.id) {
                const settings = this.perSongAutoScroll[song.id] || {};
                settings.delay = this.autoscrollDelay;
                settings.speed = this.autoScrollSpeed;
                settings.active = true;
                this.perSongAutoScroll[song.id] = settings;
                localStorage.setItem('perSongAutoScroll', JSON.stringify(this.perSongAutoScroll));
            }
        },

        stopAutoScroll(skipSave = false) {
            this.autoScrollActive = false;
            if (this.autoScrollTimer) {
                clearInterval(this.autoScrollTimer);
                this.autoScrollTimer = null;
            }
            if (this.autoScrollDelayTimer) {
                clearTimeout(this.autoScrollDelayTimer);
                this.autoScrollDelayTimer = null;
            }
            if (!skipSave) {
                const song = this.performanceSongs[this.currentPerformanceSongIndex];
                if (song && song.id) {
                    const settings = this.perSongAutoScroll[song.id] || {};
                    settings.delay = this.autoscrollDelay;
                    settings.speed = this.autoScrollSpeed;
                    settings.active = false;
                    this.perSongAutoScroll[song.id] = settings;
                    localStorage.setItem('perSongAutoScroll', JSON.stringify(this.perSongAutoScroll));
                }
            }
        },

        toggleAutoScroll() {
            if (this.autoScrollActive) {
                this.stopAutoScroll();
            } else {
                this.startAutoScroll();
            }
            this.updateAutoScrollButton();
        },

        updateAutoScrollButton() {
            const btn = this.autoScrollBtn;
            if (!btn) return;
            btn.innerHTML = this.autoScrollActive
                ? '<i class="fas fa-pause"></i>'
                : '<i class="fas fa-angle-double-down"></i>';
            btn.title = this.autoScrollActive ? 'Pause Autoscroll' : 'Start Autoscroll';
        },

        updateScrollButtonsVisibility() {
            const container = this.lyricsDisplay;
            if (!container) return;
            const needsScroll = container.scrollHeight > container.clientHeight;
            const hasScrolled = container.scrollTop > 2;

            if (hasScrolled) {
                this.scrollToTopBtn.classList.remove('invisible');
            } else {
                this.scrollToTopBtn.classList.add('invisible');
            }

            if (needsScroll) {
                this.autoScrollBtn.style.display = 'flex';
            } else {
                this.autoScrollBtn.style.display = 'none';
                this.stopAutoScroll();
            }
        },

        updateScrollBtnVisibility() {
            this.updateScrollButtonsVisibility();
        }
    };

    app.init();
  };

  once ? once('performance-init', init) : init();
});

