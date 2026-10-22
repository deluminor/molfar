import {
  bindCursorSession,
  cancelCursorTurn,
  forgetCursorSession,
  respondCursorApproval,
  respondCursorQuestion,
  sendCursorTurn,
  steerCursorTurn,
  stopCursorSession,
} from "./cursor";
import { refreshCursorCatalog } from "./cursor-catalog";
import {
  generateCursorBranchName,
  generateCursorCommitMessage,
  generateCursorPrContent,
} from "./cursor-git";
import { generateCursorSessionTitle } from "./cursor-title";
import {
  runCursorTextPrompt,
  stopCursorTextPrompt,
  warmupCursorText,
} from "./cursor-text";
import { registerHarness, type HarnessAdapter } from "../../core/registry";

export const cursorAdapter: HarnessAdapter = {
  id: "cursor",
  live: true,
  sendTurn: sendCursorTurn,
  steerTurn: steerCursorTurn,
  cancelTurn: cancelCursorTurn,
  respondApproval: respondCursorApproval,
  respondQuestion: respondCursorQuestion,
  stopSession: stopCursorSession,
  forgetSession: forgetCursorSession,
  bindSession: bindCursorSession,
  refreshCatalog: refreshCursorCatalog,
  generateTitle: generateCursorSessionTitle,
  generateCommitMessage: generateCursorCommitMessage,
  generatePrContent: generateCursorPrContent,
  generateBranchName: generateCursorBranchName,
  warmupText: warmupCursorText,
  runTextPrompt: runCursorTextPrompt,
  stopTextPrompt: stopCursorTextPrompt,
};

let registered = false;

export function ensureCursorRegistered(): void {
  if (registered) return;
  registerHarness(cursorAdapter);
  registered = true;
}
