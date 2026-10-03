set -eu
umask 077
BASE="$HOME/.vatra-host"
ENTRY="$BASE/bin/vatra-host"
LEGACY_BASE="$HOME/.monocode-host"
LEGACY_ENTRY="$LEGACY_BASE/bin/monocode-host"
VERSION=@@VERSION@@
RELEASE=@@RELEASE@@
EXISTED=0
[ -x "$ENTRY" ] && EXISTED=1
FORCE_UPGRADE=${VATRA_HOST_FORCE_UPGRADE:-0}
HOST_PORT=${VATRA_HOST_PORT:-3774}
TMP=
LOCK=
STAGE=
MIGRATING=0
cleanup() {
  [ -z "$TMP" ] || rm -rf "$TMP"
  [ -z "$STAGE" ] || rm -rf "$STAGE"
  [ -z "$LOCK" ] || rm -rf "$LOCK"
}
# An SSH drop mid-migration must not leave the machine without any host.
interrupted() {
  [ "$MIGRATING" = 0 ] || restore_legacy_host
  exit 130
}
trap cleanup EXIT
trap interrupted HUP INT TERM

if [ ! -x "$ENTRY" ] || [ "$FORCE_UPGRADE" = 1 ]; then
  case "$(uname -s)" in Darwin) OS=darwin ;; Linux) OS=linux ;; *) echo 'Vatra Host supports Linux and macOS.' >&2; exit 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; x86_64|amd64) ARCH=x64 ;; *) echo 'Unsupported host architecture.' >&2; exit 1 ;; esac
  FILE="vatra-host-$OS-$ARCH.tar.gz"
  mkdir -p "$BASE/runtime" "$BASE/bin"
  TMP=$(mktemp -d "$BASE/runtime/.install.XXXXXXXX")
  download() {
    if command -v curl >/dev/null 2>&1; then
      curl --proto '=https' --proto-redir '=https' -fLsS --connect-timeout 15 --max-time 180 "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
      wget --https-only --timeout=180 -q -O "$2" "$1"
    else
      echo 'Install curl or wget on this host and reconnect.' >&2; exit 1
    fi
  }
  if ! download "$RELEASE/$FILE" "$TMP/$FILE" || ! download "$RELEASE/$FILE.sha256" "$TMP/checksum"; then
    echo "The Vatra Host package for version $VERSION is unavailable. Install a Vatra release that includes host packages." >&2; exit 1
  fi
  EXPECTED=$(awk 'NR == 1 {print $1}' "$TMP/checksum")
  case "$EXPECTED" in *[!0-9a-f]*|'') echo 'Invalid host package checksum.' >&2; exit 1 ;; esac
  [ "${#EXPECTED}" -eq 64 ] || exit 1
  if command -v shasum >/dev/null 2>&1; then
    ACTUAL=$(shasum -a 256 "$TMP/$FILE" | awk '{print $1}')
  elif command -v sha256sum >/dev/null 2>&1; then
    ACTUAL=$(sha256sum "$TMP/$FILE" | awk '{print $1}')
  else
    echo 'Install shasum or sha256sum on this host and reconnect.' >&2; exit 1
  fi
  [ "$EXPECTED" = "$ACTUAL" ] || { echo 'Vatra Host package checksum mismatch.' >&2; exit 1; }
  mkdir "$TMP/unpacked"
  tar -xzf "$TMP/$FILE" -C "$TMP/unpacked"
  [ "$("$TMP/unpacked/vatra-host" --version)" = "$VERSION" ] || { echo 'Vatra Host version mismatch.' >&2; exit 1; }
  DEST="$BASE/runtime/$VERSION-$OS-$ARCH-$(basename "$TMP")"
  # Concurrent installations never replace a directory used by a running host.
  mv "$TMP/unpacked" "$DEST"
  [ "$("$DEST/vatra-host" --version)" = "$VERSION" ] || exit 1
  # Keep a real wrapper (rather than a symlink): it resolves the packaged Node
  # relative to the versioned executable, not this bin directory.
  printf '%s\n' "$DEST" > "$TMP/runtime-path"
  mv "$TMP/runtime-path" "$BASE/runtime-path"
  cat > "$TMP/launcher" <<'SH'
#!/bin/sh
set -eu
BASE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RUNTIME=$(cat "$BASE/runtime-path")
exec "$RUNTIME/vatra-host" "$@"
SH
  chmod 700 "$TMP/launcher"
  mv "$TMP/launcher" "$ENTRY"
fi

RETIRED_NOW=0
COPIED_NOW=
LEGACY_PORT=$HOST_PORT

# A run killed by SIGKILL, OOM or a reboot never removes its lock, so a lock
# whose owner is gone (or that never got an owner) is reclaimed.
lock_is_stale() {
  owner=$(cat "$1/pid" 2>/dev/null || true)
  if [ -n "$owner" ]; then
    ! kill -0 "$owner" 2>/dev/null
  else
    [ -n "$(find "$1" -maxdepth 0 -mmin +10 2>/dev/null)" ]
  fi
}

acquire_migration_lock() {
  path="$BASE/.legacy-migration"
  attempt=0
  until mkdir "$path" 2>/dev/null; do
    if lock_is_stale "$path"; then
      rm -rf "$path"
      continue
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 60 ]; then
      echo 'Another host installation is running. Try again shortly.' >&2; exit 1
    fi
    sleep 1
  done
  LOCK=$path
  echo "$$" > "$LOCK/pid"
}

release_migration_lock() {
  rm -rf "$LOCK"; LOCK=
}

# Called as an `if` condition, where `set -e` is off: every step returns on
# failure explicitly.
copy_legacy_state() {
  STAGE=$(mktemp -d "$BASE/.legacy-copy.XXXXXXXX") || return 1
  for name in host.db host.db-wal host.db-shm attachments; do
    if [ -e "$LEGACY_BASE/$name" ]; then
      cp -Rp "$LEGACY_BASE/$name" "$STAGE/$name" || return 1
    fi
  done
  # Sidecars left by an interrupted run belong to an older database; SQLite
  # would replay them onto the fresh copy.
  rm -f "$BASE/host.db-wal" "$BASE/host.db-shm" || return 1
  # The database is moved last: its presence marks a finished copy.
  for name in host.db-wal host.db-shm attachments host.db; do
    if [ -e "$STAGE/$name" ] && [ ! -e "$BASE/$name" ]; then
      mv "$STAGE/$name" "$BASE/$name" || return 1
      COPIED_NOW="$COPIED_NOW $name"
    fi
  done
  rm -rf "$STAGE"; STAGE=
}

# A MonoCode-era host serves the same port from ~/.monocode-host. Retire it
# once: stop its service so the ports never clash, and carry its state over so
# paired devices, the environment ID and remote sessions keep working. The
# legacy directory itself is never modified.
retire_legacy_host() {
  [ -x "$LEGACY_ENTRY" ] || return 0
  [ ! -e "$BASE/legacy-retired" ] || return 0

  acquire_migration_lock
  if [ -e "$BASE/legacy-retired" ]; then
    release_migration_lock
    return 0
  fi

  # Restoring on the default port would orphan devices paired to the old one.
  port=$("$LEGACY_ENTRY" connection-info 2>/dev/null | sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p')
  LEGACY_PORT=${port:-$HOST_PORT}

  "$LEGACY_ENTRY" service uninstall >/dev/null 2>&1 || true
  if "$LEGACY_ENTRY" connection-info >/dev/null 2>&1; then
    "$LEGACY_ENTRY" stop >/dev/null 2>&1 || true
  fi
  if "$LEGACY_ENTRY" connection-info >/dev/null 2>&1; then
    "$LEGACY_ENTRY" service install --port "$LEGACY_PORT" >/dev/null 2>&1 || true
    echo 'The previous MonoCode host in ~/.monocode-host could not be stopped. Stop it, then reconnect.' >&2; exit 1
  fi
  RETIRED_NOW=1
  MIGRATING=1

  if [ ! -e "$BASE/host.db" ] && [ -f "$LEGACY_BASE/host.db" ]; then
    if ! copy_legacy_state; then
      restore_legacy_host
      echo 'Could not copy the MonoCode host state; the previous host was restored.' >&2; exit 1
    fi
  fi

  : > "$BASE/legacy-retired"
  MIGRATING=0
  release_migration_lock
}

# Puts the legacy host back when the new one cannot start, so a failed upgrade
# never leaves the machine without a host. Only files copied by this run go.
restore_legacy_host() {
  [ "$RETIRED_NOW" = 1 ] || return 0
  MIGRATING=0
  for name in $COPIED_NOW; do
    rm -rf "${BASE:?}/$name"
  done
  rm -f "$BASE/legacy-retired"
  "$LEGACY_ENTRY" service install --port "$LEGACY_PORT" >/dev/null 2>&1 || true
}

if [ "$EXISTED" = 1 ] && [ "$FORCE_UPGRADE" = 1 ]; then
  "$ENTRY" service uninstall >/dev/null
fi
retire_legacy_host
if ! "$ENTRY" service install --port "$HOST_PORT" >/dev/null; then
  restore_legacy_host
  echo 'Vatra Host service setup failed.' >&2; exit 1
fi
"$ENTRY" connection-info
