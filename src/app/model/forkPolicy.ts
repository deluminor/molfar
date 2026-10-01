/**
 * Fork-only switches that should survive merges from upstream.
 * Keep `APP_UPDATER_DISABLED` in sync with `src-tauri/src/menu.rs`.
 *
 * This fork ships features upstream does not. Pulling their signed release
 * feed would overwrite those builds. Flip only after you publish your own
 * signed updater endpoint.
 */
export const APP_UPDATER_DISABLED = true;
