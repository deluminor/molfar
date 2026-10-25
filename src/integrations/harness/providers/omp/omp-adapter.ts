import {
  bindOmpSession,
  cancelOmpTurn,
  compactOmpContext,
  forgetOmpSession,
  respondOmpApproval,
  rewindOmpLastTurn,
  sendOmpTurn,
  steerOmpTurn,
  stopOmpSession,
} from "./omp";
import { refreshOmpCatalog } from "../pi/pi-catalog";
import { generateOmpSessionTitle } from "../pi/pi-title";
import {
  runOmpTextPrompt,
  stopOmpTextPrompt,
  warmupOmpText,
} from "../pi/pi-text";
import { registerHarness, type HarnessAdapter } from "../../core/registry";
import { ompCommandProvider, respondQuestion } from "../pi/pi-family";
import { OMP_FLAVOR } from "../pi/pi-flavor";

export const ompAdapter: HarnessAdapter = {
  id: "omp",
  live: true,
  commands: ompCommandProvider,
  respondQuestion: (sessionId, requestId, reply) =>
    respondQuestion(OMP_FLAVOR, sessionId, requestId, reply),
  sendTurn: sendOmpTurn,
  compactContext: compactOmpContext,
  rewindLastTurn: rewindOmpLastTurn,
  steerTurn: steerOmpTurn,
  cancelTurn: cancelOmpTurn,
  respondApproval: respondOmpApproval,
  stopSession: stopOmpSession,
  forgetSession: forgetOmpSession,
  bindSession: bindOmpSession,
  refreshCatalog: refreshOmpCatalog,
  generateTitle: generateOmpSessionTitle,
  warmupText: warmupOmpText,
  runTextPrompt: runOmpTextPrompt,
  stopTextPrompt: stopOmpTextPrompt,
};

let registered = false;

export function ensureOmpRegistered(): void {
  if (registered) return;
  registerHarness(ompAdapter);
  registered = true;
}
