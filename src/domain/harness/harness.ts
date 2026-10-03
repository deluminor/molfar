export type HarnessId =
  | "claude"
  | "codex"
  | "cursor"
  | "grok"
  | "opencode"
  | "pi"
  | "omp"
  | "fx"
  | "hermes"
  | "antigravity";

export const HARNESSES: HarnessId[] = [
  "claude",
  "codex",
  "cursor",
  "grok",
  "opencode",
  "pi",
  "omp",
  "fx",
  "hermes",
  "antigravity",
];
export const HARNESS_LABEL: Record<HarnessId, string> = {
  claude: "claude",
  codex: "codex",
  cursor: "cursor",
  grok: "grok",
  opencode: "opencode",
  pi: "pi",
  omp: "omp",
  fx: "fx",
  hermes: "hermes",
  antigravity: "antigravity",
};

export const HARNESS_TITLE: Record<HarnessId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  grok: "Grok Build",
  opencode: "OpenCode",
  pi: "Pi",
  omp: "omp",
  fx: "fx",
  hermes: "Hermes Agent",
  antigravity: "Antigravity",
};
/** fx ACP rejects attachment prompt blocks. */
export function harnessSupportsAttachments(id: HarnessId): boolean {
  return id !== "fx";
}
