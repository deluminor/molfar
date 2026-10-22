import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import { groupFamiliarTurns } from "@/features/sessions/model/transcript-activity";

export type FamiliarActivitySelection = {
  sessionId: string;
  turnId: string;
  /** Retain an archived turn after the viewer returns to the live window. */
  blocks: Block[];
};

export function resolveFamiliarActivity(
  selection: FamiliarActivitySelection | null,
  session: Pick<Session, "id" | "blocks" | "busy"> | undefined,
) {
  if (!selection || selection.sessionId !== session?.id) return null;
  const turns = groupFamiliarTurns(session.blocks);
  const current = turns.find((turn) => turn[0].id === selection.turnId);
  return {
    turnId: selection.turnId,
    blocks: current ?? selection.blocks,
    live: !!session.busy && !!current && current === turns[turns.length - 1],
  };
}
