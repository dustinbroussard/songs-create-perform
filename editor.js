// editor.js - bridge stub for lazy-loaded editor
window.Editor = (() => {
  let deps = null;
  let containerEl = null;

  function init(_deps) {
    deps = _deps;
  }

  function open({ container, songId } = {}) {
    containerEl = container || document.getElementById('editor-mount');
    if (!containerEl || !deps) return;
    const songs = deps.getSongs();
    let song = songId ? songs.find(s => s.id === songId) : { ...deps.core.DEFAULT_SONG };
    containerEl.innerHTML = '';

    const title = document.createElement('input');
    title.type = 'text';
    title.placeholder = 'Song Title';
    title.value = song?.title || '';
    containerEl.appendChild(title);

    const textarea = document.createElement('textarea');
    textarea.style.width = '100%';
    textarea.style.height = '200px';
    textarea.value = song?.lyrics || '';
    containerEl.appendChild(textarea);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const updated = deps.core.migrateSong({
        ...(song || {}),
        title: title.value || 'Untitled',
        lyrics: textarea.value || ''
      });
      const list = songs.filter(s => s.id !== updated.id).concat([updated]);
      deps.setSongs(list);
      deps.onSongSaved?.(updated);
    });
    containerEl.appendChild(saveBtn);
  }

  function teardown() {
    if (containerEl) {
      containerEl.innerHTML = '';
      containerEl = null;
    }
  }

  return { init, open, teardown };
})();
