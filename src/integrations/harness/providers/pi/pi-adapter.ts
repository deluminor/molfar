import {
  bindPiSession,
  cancelPiTurn,
  compactPiContext,
  forgetPiSession,
  respondPiApproval,
  rewindPiLastTurn,
  sendPiTurn,
  steerPiTurn,
  stopPiSession,
} from "./pi";
import { refreshPiCatalog } from "./pi-catalog";
import { generatePiSessionTitle } from "./pi-title";
import { runPiTextPrompt, stopPiTextPrompt, warmupPiText } from "./pi-text";
import { registerHarness, type HarnessAdapter } from "../../core/registry";
import { discoverPiSkills } from "./pi-skills";

export const piAdapter: HarnessAdapter = {
  id: "pi",
  live: true,
  commands: { discover: ({ cwd }) => discoverPiSkills(cwd) },
  sendTurn: sendPiTurn,
  compactContext: compactPiContext,
  rewindLastTurn: rewindPiLastTurn,
  steerTurn: steerPiTurn,
  cancelTurn: cancelPiTurn,
  respondApproval: respondPiApproval,
  stopSession: stopPiSession,
  forgetSession: forgetPiSession,
  bindSession: bindPiSession,
  refreshCatalog: refreshPiCatalog,
  generateTitle: generatePiSessionTitle,
  warmupText: warmupPiText,
  runTextPrompt: runPiTextPrompt,
  stopTextPrompt: stopPiTextPrompt,
};

let registered = false;

export function ensurePiRegistered(): void {
  if (registered) return;
  registerHarness(piAdapter);
  registered = true;
}
