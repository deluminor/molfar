import type { HarnessId } from "../harness/harness";

/** A session created by a Familiar during this conversation turn. */
export type FamiliarSpawnedSession = {
  sessionId: string;
  cwd: string;
  title: string;
  harness: HarnessId;
  model: string;
};

/** @deprecated Alias until familiars/model/familiarSpawnedSessions is renamed. */
export type MonoSpawnedSession = FamiliarSpawnedSession;

export type FamiliarSessionCompletion = {
  sessionId: string;
  title: string;
  status: "completed" | "failed" | "cancelled";
  /** A single report covering several sessions launched in one Familiar turn. */
  sessionCount?: number;
};
