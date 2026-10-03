import {
  bindCodexSession,
  cancelCodexTurn,
  compactCodexContext,
  rewindCodexLastTurn,
  forgetCodexSession,
  keepCodexQuestionOpen,
  respondCodexApproval,
  respondCodexQuestion,
  sendCodexTurn,
  steerCodexTurn,
  stopCodexSession,
} from "./codex";
import {
  generateCodexBranchName,
  generateCodexCommitMessage,
  generateCodexPrContent,
} from "./codex-git";
import { refreshCodexCatalog } from "./codex-catalog";
import { generateCodexSessionTitle } from "./codex-title";
import {
  runCodexTextPrompt,
  stopCodexTextPrompt,
  warmupCodexText,
} from "./codex-text";
import {
  getHarness,
  registerHarness,
  type HarnessAdapter,
} from "../../core/registry";

export const codexAdapter: HarnessAdapter = {
  id: "codex",
  live: true,
  sendTurn: sendCodexTurn,
  compactContext: compactCodexContext,
  rewindLastTurn: rewindCodexLastTurn,
  steerTurn: steerCodexTurn,
  cancelTurn: cancelCodexTurn,
  respondApproval: respondCodexApproval,
  respondQuestion: respondCodexQuestion,
  keepQuestionOpen: keepCodexQuestionOpen,
  stopSession: stopCodexSession,
  forgetSession: forgetCodexSession,
  bindSession: bindCodexSession,
  refreshCatalog: refreshCodexCatalog,
  generateTitle: generateCodexSessionTitle,
  generateCommitMessage: generateCodexCommitMessage,
  generatePrContent: generateCodexPrContent,
  generateBranchName: generateCodexBranchName,
  warmupText: warmupCodexText,
  runTextPrompt: runCodexTextPrompt,
  stopTextPrompt: stopCodexTextPrompt,
};

let registered = false;

export function ensureCodexRegistered(): void {
  if (registered && getHarness("codex") === codexAdapter) return;
  registerHarness(codexAdapter);
  registered = true;
}
