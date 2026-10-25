import type { HarnessId } from "../harness/harness";

export type OrchestrationChoice = {
  harness: HarnessId;
  model: string;
  name: string;
};
export type OrchestrationSettings = {
  choices: OrchestrationChoice[];
  maxWorkers: number;
};
export type ProposedTask = {
  id: string;
  title: string;
  prompt: string;
  harness: HarnessId;
  model: string;
  modelSettings?: Record<string, string>;
  files: string[];
  dependsOn: string[];
};
export type OrchestrationProposal = {
  version: 1;
  leadId: string;
  /** Project identity retained for history and proposal ownership. */
  cwd: string;
  /** Concrete checkout inspected while preparing this proposal. */
  checkoutCwd?: string;
  request: string;
  author: OrchestrationChoice;
  settings: OrchestrationSettings;
  status: "planning" | "ready" | "invalid" | "starting" | "approved";
  title: string;
  summary: string;
  tasks: ProposedTask[];
  error?: string;
  /** Kept only for invalid cards so a retry can repair the response directly. */
  response?: string;
};
