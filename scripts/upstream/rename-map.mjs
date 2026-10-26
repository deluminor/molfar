/**
 * Renames MOLFAR applied on top of MonoCode. Upstream patches are rewritten
 * through these before they are applied, so upstream edits land in MOLFAR's
 * renamed files and identifiers. Each rule expands to its lower, Capitalized
 * and UPPER forms, plural included (`monos` → `familiars`).
 */
export const RENAMES = [{ from: "mono", to: "familiar" }];

/** Upstream's product name and font family names: they contain a rename source word but are not renamed. */
export const KEEP_PHRASES = [
  /monocode/gi,
  /\b(?:Nerd Font|Liberation|JetBrains|SF|Roboto|Fira|Plex|Cascadia|Noto Sans|DejaVu Sans|Ubuntu|Source Code|Geist|Martian) Mono\b/g,
];

/** MOLFAR-owned or license files: upstream edits apply verbatim and are reviewed by hand. */
export const VERBATIM_PATHS = [
  /^CHANGELOG\.md$/,
  /(^|\/)(LICENSE|NOTICE|COPYING)[^/]*$/,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)Cargo\.(toml|lock)$/,
  /^src-tauri\/tauri(\.[a-z]+)?\.conf\.json$/,
];
