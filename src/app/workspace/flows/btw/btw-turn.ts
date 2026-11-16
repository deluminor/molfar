import type { Block } from "@/domain/session/block";
import type { HarnessId } from "@/domain/harness/harness";
import type { Session } from "@/domain/session/session";
import { btwTurnHarness } from "@/features/sessions/model/btw";
import { harnessForTurn } from "@/features/sessions/model/second-opinion";

/** The turn a side thread hangs off, as the open session has it now. */
export function btwTurn(
  sessions: readonly Session[],
  sessionId: string,
  turn: Block[],
  threadId: string,
) {
  const source = sessions.find((session) => session.id === sessionId);
  const sourceUserId = turn.find((block) => block.role === "user")?.id;
  const turnHarness = source ? harnessForTurn(source.blocks, turn, source.harness) : undefined;
  const sourceBlock = source?.blocks.find(
    (block) => block.id === sourceUserId && block.role === "user",
  );
  const existing = sourceBlock?.btwThreads?.find((thread) => thread.id === threadId);

  return { source, sourceUserId, turnHarness, sourceBlock, existing };
}

export type BtwTurn = ReturnType<typeof btwTurn>;

/** The harness an existing thread runs on: its own, else the turn's. */
export function btwThreadHarness(
  { source, existing, turnHarness }: BtwTurn,
  turn: Block[],
): HarnessId | undefined {
  if (!source) return undefined;
  return existing?.harness ?? btwTurnHarness(source.blocks, turn, source.harness) ?? turnHarness;
}
