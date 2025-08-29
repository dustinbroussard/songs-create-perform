#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$root_dir/assets/vendor/fontawesome/css" "$root_dir/assets/vendor/fontawesome/webfonts" "$root_dir/assets/vendor/fonts"

echo "Downloading Font Awesome CSS and webfonts..."
curl -fsSL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css -o "$root_dir/assets/vendor/fontawesome/css/all.min.css"
for f in fa-solid-900.woff2 fa-regular-400.woff2 fa-brands-400.woff2; do
  curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/$f" -o "$root_dir/assets/vendor/fontawesome/webfonts/$f"
done

echo "Downloading Neonderthaw font..."
curl -fsSL "https://fonts.googleapis.com/css2?family=Neonderthaw&display=swap" -o /tmp/neonderthaw.css
NEON_URL=$(grep -oE 'https://[^\)]+\.woff2' /tmp/neonderthaw.css | head -n1)
curl -fsSL "$NEON_URL" -o "$root_dir/assets/vendor/fonts/neonderthaw.woff2"
cat > "$root_dir/assets/vendor/fonts/neonderthaw.css" <<'CSS'
@font-face {
  font-family: 'Neonderthaw';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./neonderthaw.woff2') format('woff2');
}
CSS

echo "Done. Local assets installed under assets/vendor/."
