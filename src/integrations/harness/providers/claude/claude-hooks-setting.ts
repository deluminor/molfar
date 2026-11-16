import { readFlag, writeFlag } from "@/shared/lib/storage-flags";

const CLAUDE_HOOKS_KEY = "molfar.claudeHooks";

const CLAUDE_HOOKS_DEFAULT = true;

export function loadClaudeHooks(): boolean {
  return readFlag(CLAUDE_HOOKS_KEY) ?? CLAUDE_HOOKS_DEFAULT;
}

export function saveClaudeHooks(value: boolean) {
  writeFlag(CLAUDE_HOOKS_KEY, value);
}
