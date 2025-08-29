# Hill Rd. Setlist Manager

A modern, touch‑friendly web app to manage songs, lyrics, and performance setlists. Works entirely in the browser with localStorage (no backend), and supports offline use via a Service Worker.

## Features
- Songs: import TXT/DOCX, search, edit in a rich section‑aware editor, copy/export.
- Setlists: create/rename/duplicate/delete, drag‑reorder, fuzzy import from text, export (JSON/TXT/CSV/PDF).
- Performance Mode: large lyrics view, per‑song font size, autoscroll with per‑song settings, quick metadata edits.
- Offline/PWA: installs as an app; caches core assets for offline use.
- Optional AI tools: format/polish/rewrite/continue/suggest chords via OpenRouter.

## Quick Start
1. Install deps (for local dev server):
   - `npm install`
2. Serve locally (enables Service Worker + PWA features):
   - `npm run serve`
   - Open `http://localhost:5173`

You can also open `index.html` directly from disk for a quick look, but Service Worker and AI features won’t run in `file://`.

## Data & Storage
- All data is stored in `localStorage` under namespaced keys: `hrsm:songs`, `hrsm:setlists`, `hrsm:settings`, `hrsm:version`.
- Legacy keys `songs`/`setlists` are automatically migrated on first load.

## AI Setup (Optional)
AI tools in the editor use OpenRouter APIs.
- Get an API key from OpenRouter.
- In the editor (Editor Mode → AI Settings), paste your key and choose a model.
- Notes:
  - Network access is required.
  - Model list fetches from OpenRouter; if blocked, you can type a model id manually and save.

## Offline/PWA Notes
- The Service Worker precaches core pages, scripts, and key assets including icons and logo.
- External CDNs (fonts/icons) are not precached; they will load when online and fall back gracefully offline.
- To force a cache refresh after changes, reload the page (SW updates automatically). 

## Development
- Source: vanilla JS/HTML/CSS, no build step.
- Libraries vendored in `/lib`: `fuse.js`, `Sortable.min.js`, `mammoth.browser.min.js`.
- Lint/format: `npm run format` (Prettier).

## Known Limitations
- No automated tests yet.
- AI requires user‑provided API key and network.
- Fonts/icons from external CDNs are not cached offline by default.

## License
ISC
