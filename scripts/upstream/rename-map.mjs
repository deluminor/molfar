/**
 * Renames MOLFAR applied on top of MonoCode. Upstream patches are rewritten
 * through these before they are applied, so upstream edits land in MOLFAR's
 * renamed files and identifiers. Each rule expands to its lower, Capitalized
 * and UPPER forms, plural included (`monos` → `familiars`).
 */
export const RENAMES = [
  { from: "bundle_uses_monocode_data", to: "bundle_uses_desktop_data" },
  { from: "monocode_database", to: "desktop_database" },
  { from: "monocode_import", to: "desktop_import" },
  { from: "import_monocode", to: "import_desktop" },
  { from: "open_monocode", to: "open_desktop" },
  { from: "read_monocode", to: "read_desktop" },
  { from: "use_monocode", to: "use_desktop" },
  { from: "monocode_db", to: "desktop_db" },
  { from: "monocode-data", to: "desktop-data" },
  { from: "monocode-db", to: "desktop-db" },
  { from: "monocode", to: "molfar" },
  { from: "mono", to: "familiar" },
];

export const KEEP_PHRASES = [
  /(?:github\.com|raw\.githubusercontent\.com)\/[\w.-]+\/monocode\b[^\s"')]*/gi,
  /\bMonoCode #\d+/g,
  /^.*(?:Copyright|SPDX-License-Identifier|derived from|adapted from).*$/gim,
  /\b(?:Nerd Font|Liberation|JetBrains|SF|Roboto|Fira|Plex|Cascadia|Noto Sans|DejaVu Sans|Ubuntu|Source Code|Geist|Martian) Mono\b/g,
];

/** MOLFAR-owned or license files: upstream edits apply verbatim and are reviewed by hand. */
export const VERBATIM_PATHS = [
  /^CHANGELOG\.md$/,
  /(?:legacyStorageMigration|legacy-storage-migration)\.[cm]?[jt]s$/,
  /(^|\/)(LICENSE|NOTICE|COPYING)[^/]*$/,
  /\.LICENSE[^/]*$/i,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)Cargo\.(toml|lock)$/,
  /^src-tauri\/tauri(\.[a-z]+)?\.conf\.json$/,
];
