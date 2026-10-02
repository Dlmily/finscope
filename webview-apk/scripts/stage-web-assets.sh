#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mobile"
WEBVIEW_DIR="$ROOT_DIR/webview-apk"
EXPORT_DIR="$MOBILE_DIR/web-dist"
ASSETS_DIR="$WEBVIEW_DIR/app/src/main/assets"

cd "$MOBILE_DIR"
rm -rf "$EXPORT_DIR"
npx expo export --platform web --output-dir "$EXPORT_DIR"

# Expo's static HTML uses root-relative URLs. The WebView uses a file:// origin,
# so the entry assets need paths relative to index.html. Android's asset packer
# ignores directory names beginning with an underscore, so `_expo` is renamed.
sed -i \
  -e 's#href="/favicon\.ico"#href="./favicon.ico"#g' \
  -e 's#src="/_expo/#src="./expo/#g' \
  -e 's|</head>|<style id="finscope-boot-style">html,body,#root{background:#060609!important}#finscope-boot{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#060609;color:#f5f7fb;font:800 18px sans-serif;letter-spacing:2px;pointer-events:none;transition:opacity .18s ease-out}#finscope-boot small{color:#00f0ff;font-size:8px;letter-spacing:1.6px}#root:not(:empty)~#finscope-boot{opacity:0;visibility:hidden}</style></head>|g' \
  -e 's#<div id="root"></div>#<div id="root"></div><div id="finscope-boot">FIN•SCOPE<small>INITIALIZING LOCAL TERMINAL</small></div>#g' \
  "$EXPORT_DIR/index.html"

# With pnpm, Expo can emit icon fonts under a hidden `.pnpm` path. Android's
# asset packer ignores hidden path segments, so move the font to a stable path
# and rewrite the Web bundle's document-relative asset URL.
ICON_FONT_SOURCE="$(find "$EXPORT_DIR/assets" -type f -name 'MaterialCommunityIcons.*.ttf' -print -quit)"
if [[ -n "$ICON_FONT_SOURCE" ]]; then
  mkdir -p "$EXPORT_DIR/assets/fonts"
  cp "$ICON_FONT_SOURCE" "$EXPORT_DIR/assets/fonts/MaterialCommunityIcons.ttf"
  find "$EXPORT_DIR/_expo/static/js/web" -type f -name '*.js' -exec sed -i -E 's#"/assets/node_modules/[^\"]*/MaterialCommunityIcons\.[a-f0-9]+\.ttf"#"./assets/fonts/MaterialCommunityIcons.ttf"#g' {} +
  rm -rf "$EXPORT_DIR/assets/node_modules"
fi

rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"
cp -a "$EXPORT_DIR/." "$ASSETS_DIR/"

if [[ -d "$ASSETS_DIR/_expo" ]]; then
  mv "$ASSETS_DIR/_expo" "$ASSETS_DIR/expo"
fi

test -f "$ASSETS_DIR/index.html"
test -d "$ASSETS_DIR/expo"
find "$ASSETS_DIR/expo" -type f -name '*.js' -print -quit | grep -q .
test -f "$ASSETS_DIR/assets/fonts/MaterialCommunityIcons.ttf"
echo "Staged WebView assets in $ASSETS_DIR"
