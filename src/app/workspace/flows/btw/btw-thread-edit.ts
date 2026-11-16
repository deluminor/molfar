import type { Block } from "@/domain/session/block";
import type { BtwThread } from "@/domain/session/block-meta";
import type { Session } from "@/domain/session/session";
import { replaceBtwThread } from "@/features/sessions/model/btw";

export type BtwThreadEdit = { next: Session[]; updated: Session };

function editUserBlock(
  sessions: readonly Session[],
  sessionId: string,
  userBlockId: string,
  edit: (block: Block) => Block | undefined,
): BtwThreadEdit | undefined {
  let updated: Session | undefined;
  const next = sessions.map((session) => {
    if (session.id !== sessionId) return session;
    const blockIndex = session.blocks.findIndex(
      (block) => block.id === userBlockId && block.role === "user",
    );
    if (blockIndex < 0) return session;
    const nextBlock = edit(session.blocks[blockIndex]);
    if (!nextBlock) return session;

    const blocks = session.blocks.slice();
    blocks[blockIndex] = nextBlock;
    updated = { ...session, blocks };
    return updated;
  });

  return updated && { next, updated };
}

/** Replaces (or adds) a side thread on a turn's user block; `update` returning undefined leaves it. */
export function editBtwThread(
  sessions: readonly Session[],
  sessionId: string,
  userBlockId: string,
  threadId: string,
  update: (thread: BtwThread | undefined) => BtwThread | undefined,
): BtwThreadEdit | undefined {
  return editUserBlock(sessions, sessionId, userBlockId, (block) => {
    const current = block.btwThreads?.find((thread) => thread.id === threadId);
    const nextThread = update(current);
    if (!nextThread) return undefined;

    return current
      ? replaceBtwThread(block, nextThread)
      : { ...block, btwThreads: [...(block.btwThreads ?? []), nextThread] };
  });
}

export function removeBtwThread(
  sessions: readonly Session[],
  sessionId: string,
  userBlockId: string,
  threadId: string,
): BtwThreadEdit | undefined {
  return editUserBlock(sessions, sessionId, userBlockId, (block) => {
    const threads = block.btwThreads ?? [];
    if (!threads.some((thread) => thread.id === threadId)) return undefined;

    const nextThreads = threads.filter((thread) => thread.id !== threadId);
    return { ...block, btwThreads: nextThreads.length > 0 ? nextThreads : undefined };
  });
}
