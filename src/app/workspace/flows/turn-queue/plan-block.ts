import type { Block } from "@/domain/session/block";
import type { PlanBuildTarget } from "@/domain/session/turn";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { buildRemotePlan } from "@/features/connections/model/remote-session-actions";
import { saveLastModelSettings } from "@/features/sessions/model/models";
import type { TurnQueueDeps } from "./turn-queue-deps";

/** A plan the agent is still writing, or one already built, takes no edits. */
function planSettled(block: Block): boolean {
  const status = block.plan?.status;
  return status === "streaming" || status === "building" || status === "built";
}

function editedPlan(block: Block, blockId: string, text: string): Block {
  if (block.id !== blockId || block.role !== "plan" || planSettled(block)) return block;

  const originalText = block.plan?.originalText ?? block.text;
  return {
    ...block,
    text,
    plan: {
      ...(block.plan ?? { status: "ready" as const }),
      status: "ready" as const,
      originalText,
      edited: text !== originalText,
    },
  };
}

export function updatePlan(
  deps: TurnQueueDeps,
  sessionId: string,
  blockId: string,
  text: string,
): void {
  deps.updateSessions((prev) =>
    prev.map((session) => {
      if (remoteProjectFor(session.cwd)) return session;
      if (session.id !== sessionId || session.busy) return session;
      return {
        ...session,
        blocks: session.blocks.map((block) => editedPlan(block, blockId, text)),
      };
    }),
  );
}

export function buildPlan(
  deps: TurnQueueDeps,
  sessionId: string,
  blockId: string,
  target?: PlanBuildTarget,
): void {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  if (session && remoteProjectFor(session.cwd)) {
    buildRemotePlan(sessionId, blockId, target);
    return;
  }

  const block = session?.blocks.find((entry) => entry.id === blockId);
  if (
    !session ||
    session.busy ||
    block?.role !== "plan" ||
    block.orchestration ||
    !block.text.trim() ||
    planSettled(block)
  ) {
    return;
  }

  if (target && session.modelSettings) saveLastModelSettings(session.modelSettings, "fill");
  deps.submit(sessionId, "Build approved plan", [], {
    intent: "build",
    planBlockId: blockId,
    buildTarget: target,
  });
}
