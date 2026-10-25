import type { Block } from "@/domain/session/block";
import type { BtwThread } from "@/domain/session/block-meta";
import type { Session } from "@/domain/session/session";
import { btwTurnHarness, sealBtwResponseBlocks, supportsBtwHarness } from "@/features/sessions/model/btw";
import { preferredModelSettings } from "@/features/sessions/model/models";
import { nativeModelId, resolveModel } from "@/integrations/harness/core/models/resolve-model";
import { type BtwRequests, createBtwRequests } from "./btw-requests";
import { runBtwRequest } from "./btw-run";
import { editBtwThread, removeBtwThread } from "./btw-thread-edit";
import { btwThreadHarness, btwTurn } from "./btw-turn";

export type BtwDeps = {
  openSessions(): Session[];
  commitSessions(next: Session[]): void;
  persist(session: Session): void;
};

/** Side ("by the way") questions asked about a finished turn. */
export function createBtw(deps: BtwDeps, requests: BtwRequests = createBtwRequests()) {
  const update = (
    sessionId: string,
    userBlockId: string,
    threadId: string,
    edit: (thread: BtwThread | undefined) => BtwThread | undefined,
  ): Session | undefined => {
    const result = editBtwThread(deps.openSessions(), sessionId, userBlockId, threadId, edit);
    if (!result) return undefined;

    deps.commitSessions(result.next);
    deps.persist(result.updated);
    return result.updated;
  };
  const run = { update, requests };

  const submit = (
    sessionId: string,
    turn: Block[],
    threadId: string,
    messageId: string,
    text: string,
    model?: string,
    modelSettings?: Record<string, string>,
  ): boolean => {
    const { source, sourceUserId, turnHarness, sourceBlock, existing } = btwTurn(
      deps.openSessions(),
      sessionId,
      turn,
      threadId,
    );
    const sourceEndBlockId = turn[turn.length - 1]?.id;
    const turnModel = turn.find((block) => block.role === "user")?.turnModel?.id;
    const requestHarness = source
      ? supportsBtwHarness(turnHarness)
        ? turnHarness
        : (existing?.harness ?? btwTurnHarness(source.blocks, turn, source.harness))
      : undefined;
    if (
      !source ||
      !supportsBtwHarness(requestHarness) ||
      source.worktreeRemoved ||
      !sourceUserId ||
      !sourceEndBlockId ||
      !sourceBlock
    )
      return false;

    const selectedModel =
      model?.trim() || existing?.model || turnModel || nativeModelId(source.model).trim();
    const selectedModelSettings =
      modelSettings ??
      existing?.modelSettings ??
      preferredModelSettings(
        resolveModel(requestHarness, selectedModel || source.model),
        source.modelSettings,
      );
    if (existing?.status === "running") return false;
    if (existing && existing.sourceEndBlockId !== sourceEndBlockId) return false;

    const now = Date.now();
    const message = { id: messageId, role: "user" as const, text, createdAt: now };
    const thread: BtwThread = existing
      ? {
          ...existing,
          harness: existing.harness ?? turnHarness,
          model: selectedModel || undefined,
          modelSettings: selectedModelSettings,
          status: "running",
          updatedAt: now,
          error: undefined,
          pendingBlocks: [],
          messages: [...existing.messages, message],
        }
      : {
          id: threadId,
          sourceEndBlockId,
          createdAt: now,
          updatedAt: now,
          status: "running",
          pendingBlocks: [],
          harness: requestHarness,
          ...(selectedModel ? { model: selectedModel } : {}),
          modelSettings: selectedModelSettings,
          messages: [message],
        };
    if (!update(sessionId, sourceUserId, threadId, () => thread)) return false;

    runBtwRequest(run, {
      sessionId,
      userBlockId: sourceUserId,
      source,
      thread,
      harness: thread.harness ?? requestHarness,
    });
    return true;
  };

  const changeModel = (
    sessionId: string,
    turn: Block[],
    threadId: string,
    model: string,
    modelSettings: Record<string, string>,
  ): void => {
    const context = btwTurn(deps.openSessions(), sessionId, turn, threadId);
    const { source, sourceUserId } = context;
    const nextModel = model.trim();
    if (
      !source ||
      !supportsBtwHarness(btwThreadHarness(context, turn)) ||
      source.worktreeRemoved ||
      !sourceUserId ||
      !nextModel
    )
      return;

    update(sessionId, sourceUserId, threadId, (thread) =>
      thread ? { ...thread, model: nextModel, modelSettings, updatedAt: Date.now() } : undefined,
    );
  };

  const remove = (sessionId: string, turn: Block[], threadId: string): void => {
    const context = btwTurn(deps.openSessions(), sessionId, turn, threadId);
    const { source, sourceUserId } = context;
    if (
      !source ||
      !supportsBtwHarness(btwThreadHarness(context, turn)) ||
      source.worktreeRemoved ||
      !sourceUserId
    )
      return;

    requests.abort(sessionId, threadId);
    const result = removeBtwThread(deps.openSessions(), sessionId, sourceUserId, threadId);
    if (!result) return;
    deps.commitSessions(result.next);
    deps.persist(result.updated);
  };

  // Stopping keeps whatever the side answer had streamed, like stopping a
  // main turn, and leaves the thread ready for the next question.
  const stop = (sessionId: string, turn: Block[], threadId: string): void => {
    const sourceUserId = turn.find((block) => block.role === "user")?.id;
    if (!sourceUserId) return;

    requests.abort(sessionId, threadId);
    update(sessionId, sourceUserId, threadId, (thread) => {
      if (thread?.status !== "running") return thread;
      const userMessageId = thread.messages[thread.messages.length - 1]?.id ?? thread.id;
      const pending = thread.pendingBlocks ?? [];
      const blocks =
        pending.length > 0 && thread.harness
          ? sealBtwResponseBlocks(pending, thread.harness, thread.model ?? "", userMessageId)
          : [];
      const text = blocks
        .filter((block) => block.role === "assistant")
        .map((block) => block.text)
        .join("\n\n")
        .trim();
      const now = Date.now();

      return {
        ...thread,
        status: "ready",
        updatedAt: now,
        pendingBlocks: undefined,
        error: undefined,
        messages: blocks.length
          ? [
              ...thread.messages,
              { id: crypto.randomUUID(), role: "assistant", text, createdAt: now, blocks },
            ]
          : thread.messages,
      };
    });
  };

  const retry = (sessionId: string, turn: Block[], threadId: string): void => {
    const context = btwTurn(deps.openSessions(), sessionId, turn, threadId);
    const { source, sourceUserId, sourceBlock, existing } = context;
    const threadHarness = btwThreadHarness(context, turn);
    if (!source || !supportsBtwHarness(threadHarness) || source.worktreeRemoved || !sourceUserId)
      return;
    if (!sourceBlock || !existing || existing.status !== "error") return;

    const thread: BtwThread = {
      ...existing,
      status: "running",
      updatedAt: Date.now(),
      error: undefined,
      pendingBlocks: [],
    };
    const updated = update(sessionId, sourceUserId, threadId, () => thread);
    if (!updated) return;

    runBtwRequest(run, {
      sessionId,
      userBlockId: sourceUserId,
      source: updated,
      thread,
      harness: thread.harness ?? threadHarness,
    });
  };

  return {
    submit,
    changeModel,
    remove,
    stop,
    retry,
    abortClosed: requests.abortClosed,
    abortAll: requests.abortAll,
  };
}
