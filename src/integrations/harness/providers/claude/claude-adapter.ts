import {
  bindClaudeSession,
  cancelClaudeTurn,
  compactClaudeContext,
  forgetClaudeSession,
  respondClaudeApproval,
  respondClaudeQuestion,
  restoreClaudeTaskLists,
  sendClaudeTurn,
  steerClaudeTurn,
  stopClaudeSession,
} from "./claude";
import { refreshClaudeCatalog } from "./claude-catalog";
import {
  generateClaudeBranchName,
  generateClaudeCommitMessage,
  generateClaudePrContent,
} from "./claude-git";
import { generateClaudeSessionTitle } from "./claude-title";
import {
  runClaudeTextPrompt,
  stopClaudeTextPrompt,
  warmupClaudeText,
} from "./claude-text";
import { registerHarness, type HarnessAdapter } from "../../core/registry";

export const claudeAdapter: HarnessAdapter = {
  id: "claude",
  live: true,
  sendTurn: sendClaudeTurn,
  compactContext: compactClaudeContext,
  steerTurn: steerClaudeTurn,
  cancelTurn: cancelClaudeTurn,
  respondApproval: respondClaudeApproval,
  respondQuestion: respondClaudeQuestion,
  stopSession: stopClaudeSession,
  forgetSession: forgetClaudeSession,
  bindSession: bindClaudeSession,
  restoreTaskLists: restoreClaudeTaskLists,
  refreshCatalog: refreshClaudeCatalog,
  generateTitle: generateClaudeSessionTitle,
  generateCommitMessage: generateClaudeCommitMessage,
  generatePrContent: generateClaudePrContent,
  generateBranchName: generateClaudeBranchName,
  warmupText: warmupClaudeText,
  runTextPrompt: runClaudeTextPrompt,
  stopTextPrompt: stopClaudeTextPrompt,
};

let registered = false;

export function ensureClaudeRegistered(): void {
  if (registered) return;
  registerHarness(claudeAdapter);
  registered = true;
}
