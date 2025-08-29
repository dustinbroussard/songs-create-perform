This directory is for self-hosted vendor assets (fonts/icons).

Populate with:
- Font Awesome CSS and webfonts under `fontawesome/`:
  - css/all.min.css
  - webfonts/fa-solid-900.woff2, fa-regular-400.woff2, fa-brands-400.woff2
- Neonderthaw font under `fonts/`:
  - fonts/neonderthaw.woff2
  - fonts/neonderthaw.css (declares @font-face pointing to neonderthaw.woff2)

See `scripts/fetch-assets.sh` for an example fetch script.
