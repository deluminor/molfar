/**
 * Fork-only switches that should survive merges from upstream.
 * Keep `APP_UPDATER_DISABLED` in sync with `src-tauri/src/menu.rs`.
 *
 * Updates come from this fork's own signed feed (`tauri.conf.json` →
 * `plugins.updater`, published by `.github/workflows/release.yml`). Flip to
 * `true` to stop every update check, e.g. if the signing key is compromised.
 */
export const APP_UPDATER_DISABLED = false;
