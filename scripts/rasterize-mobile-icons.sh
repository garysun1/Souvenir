#!/usr/bin/env bash
# Rasterizes apps/mobile/assets/icon-src/*.svg (from scripts/build-icons.mjs)
# into the PNGs referenced by apps/mobile/app.json. Requires Chrome/Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=apps/mobile/assets/icon-src
OUT=apps/mobile/assets/images
CHROME=${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}

# Headless Chrome enforces a minimum window size, so always render at 1024
# and downscale with ImageMagick.
render() { # svg size out
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --default-background-color=00000000 --window-size=1024,1024 \
    --screenshot="$3" "file://$PWD/$1" >/dev/null 2>&1
  if [ "$2" != 1024 ]; then convert "$3" -resize "$2x$2" "$3"; fi
}

render "$SRC/icon.svg" 1024 "$OUT/icon.png"
render "$SRC/android-foreground.svg" 512 "$OUT/android-icon-foreground.png"
render "$SRC/android-background.svg" 512 "$OUT/android-icon-background.png"
render "$SRC/android-foreground.svg" 432 "$OUT/android-icon-monochrome.png"
render "$SRC/mark.svg" 228 "$OUT/splash-icon.png"
render "$SRC/icon.svg" 48 "$OUT/favicon.png"
echo "Wrote mobile icon PNGs to $OUT"
