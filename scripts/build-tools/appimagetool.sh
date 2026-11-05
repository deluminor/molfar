#!/usr/bin/env bash
set -euo pipefail

APPIMAGETOOL_VERSION="1.9.1"
APPIMAGETOOL_SHA256="ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0"

tools_dir="${XDG_CACHE_HOME:-$HOME/.cache}/molfar-build"
appimagetool="$tools_dir/appimagetool-$APPIMAGETOOL_VERSION-x86_64.AppImage"
mkdir -p "$tools_dir"
if [[ ! -f "$appimagetool" ]] || ! sha256sum --quiet -c <<<"$APPIMAGETOOL_SHA256  $appimagetool" 2>/dev/null; then
  curl -fsSL --retry 3 -o "$appimagetool.part" \
    "https://github.com/AppImage/appimagetool/releases/download/$APPIMAGETOOL_VERSION/appimagetool-x86_64.AppImage"
  if ! sha256sum --quiet -c <<<"$APPIMAGETOOL_SHA256  $appimagetool.part"; then
    echo "appimagetool checksum mismatch" >&2
    rm -f "$appimagetool.part"
    exit 1
  fi
  mv "$appimagetool.part" "$appimagetool"
fi
chmod +x "$appimagetool"

printf '%s\n' "$appimagetool"
