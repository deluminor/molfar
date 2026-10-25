import type { BtwThread } from "@/domain/session/block-meta";
import { HARNESS_TITLE, type HarnessId } from "@/domain/harness/harness";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import {
  applyBtwHarnessEvent,
  buildBtwPrompt,
  sealBtwResponseBlocks,
  supportsBtwHarness,
} from "@/features/sessions/model/btw";
import { runHarnessTextPrompt } from "@/integrations/harness";
import { nativeModelId } from "@/integrations/harness/core/models/resolve-model";
import type { BtwRequests } from "./btw-requests";

export type BtwThreadUpdate = (
  sessionId: string,
  userBlockId: string,
  threadId: string,
  update: (thread: BtwThread | undefined) => BtwThread | undefined,
) => Session | undefined;

export type BtwRunDeps = { update: BtwThreadUpdate; requests: BtwRequests };

export type BtwRunInput = {
  sessionId: string;
  userBlockId: string;
  source: Session;
  thread: BtwThread;
  harness: HarnessId;
};

/** Asks the side question on the source session's harness and streams the answer into the thread. */
export function runBtwRequest({ update, requests }: BtwRunDeps, input: BtwRunInput): void {
  const { harness } = input;
  if (!supportsBtwHarness(harness)) return;

  const updateThread = (edit: (thread: BtwThread | undefined) => BtwThread | undefined) =>
    update(input.sessionId, input.userBlockId, input.thread.id, edit);
  const fail = (error: string, clearPending = false) =>
    updateThread((thread) =>
      thread
        ? {
            ...thread,
            status: "error",
            updatedAt: Date.now(),
            ...(clearPending ? { pendingBlocks: undefined } : {}),
            error,
          }
        : undefined,
    );
  const cwd = sessionWorkCwd(input.source);
  const model = nativeModelId(input.thread.model ?? input.source.model).trim();

  if (!cwd || cwd === "~") {
    fail("A project working directory is required for this question.");
    return;
  }
  if (!model && harness === "codex") {
    fail("The selected Codex model is unavailable.");
    return;
  }

  let prompt: string;
  try {
    prompt = buildBtwPrompt({ blocks: input.source.blocks, thread: input.thread, cwd });
  } catch (error) {
    fail(error instanceof Error ? error.message : "The completed turn is no longer available.");
    return;
  }

  const controller = requests.start(input.sessionId, input.thread.id);
  const userMessageId = input.thread.messages[input.thread.messages.length - 1]?.id ?? input.thread.id;
  const responseModel = model || input.source.model;

  void runHarnessTextPrompt({
    harness,
    cwd,
    providerAccountId: input.source.providerAccountId,
    model: model || undefined,
    modelSettings: input.thread.modelSettings ?? input.source.modelSettings,
    ephemeral: false,
    codexStore: isFamiliarSession(input.source.id) ? "mono" : undefined,
    threadId: input.thread.providerThreadId,
    onThreadId: (providerThreadId) => {
      if (controller.signal.aborted) return;
      updateThread((thread) =>
        thread && thread.providerThreadId !== providerThreadId
          ? { ...thread, providerThreadId, updatedAt: Date.now() }
          : thread,
      );
    },
    onEvent: (event) => {
      if (controller.signal.aborted) return;
      updateThread((thread) =>
        thread?.status === "running"
          ? {
              ...thread,
              updatedAt: Date.now(),
              pendingBlocks: applyBtwHarnessEvent(
                thread.pendingBlocks ?? [],
                event,
                harness,
                responseModel,
                userMessageId,
              ),
            }
          : undefined,
      );
    },
    intent: "plan",
    prompt,
    signal: controller.signal,
  })
    .then((output) => {
      if (controller.signal.aborted) return;
      const text = output.trim();
      if (!text) throw new Error(`${HARNESS_TITLE[harness]} returned an empty side answer.`);

      updateThread((thread) => {
        if (!thread) return undefined;
        const pendingBlocks = thread.pendingBlocks ?? [];
        const blocks =
          pendingBlocks.length > 0
            ? sealBtwResponseBlocks(pendingBlocks, harness, responseModel, userMessageId)
            : undefined;

        return {
          ...thread,
          status: "ready",
          updatedAt: Date.now(),
          pendingBlocks: undefined,
          messages: [
            ...thread.messages,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text,
              createdAt: Date.now(),
              ...(blocks?.length ? { blocks } : {}),
            },
          ],
          error: undefined,
        };
      });
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;
      fail(
        error instanceof Error
          ? error.message
          : `${HARNESS_TITLE[harness]} could not answer this side question.`,
        true,
      );
    })
    .finally(() => requests.finish(input.sessionId, input.thread.id, controller));
}
