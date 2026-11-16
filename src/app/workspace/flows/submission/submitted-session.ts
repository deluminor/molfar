import { acknowledgeFamiliarMessage } from "@/features/familiars/model/familiar-messaging";
import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import { appendPreparingHandoff } from "@/features/sessions/model/handoff";
import { dequeueQueuedMessage } from "@/features/sessions/model/message-queue";
import { appendUser, stopStreaming } from "@/integrations/harness";
import { withPlanBuildTarget } from "../../../model/harness-choice";
import type { PreparedSubmission } from "./prepared-submission";
import type { TurnSetup } from "./turn-setup";

/** The session with the turn's user message and the state a new turn starts in. */
function startedSession(
  s: Session,
  turn: PreparedSubmission,
  setup: TurnSetup,
): { next: Session; title: string } {
  const { options, draftBlock, editedResend, approvedPlan, intent } = turn;
  const keepCards = turn.rawCommand || options?.ciRepair;
  const draftRemoved = draftBlock
    ? { ...s, blocks: s.blocks.filter((block) => block.id !== draftBlock.id) }
    : s;
  const selected = options?.buildTarget
    ? withPlanBuildTarget(draftRemoved, options.buildTarget)
    : draftRemoved;

  let next: Session = {
    ...selected,
    providerAccountId: turn.providerAccountId,
    usageLimit: undefined,
    worktreePreparing: turn.createDraftWorktree ? true : selected.worktreePreparing,
    inboxCard: keepCards ? s.inboxCard : undefined,
    noteCard: keepCards ? s.noteCard : undefined,
    handoffCard: keepCards ? s.handoffCard : undefined,
  };
  if (editedResend) next = editedResend.replace(next);
  if (approvedPlan && intent === "build") {
    next = {
      ...next,
      blocks: next.blocks.map((block) =>
        block.id === approvedPlan.id && block.role === "plan"
          ? {
              ...block,
              plan: {
                ...(block.plan ?? { status: "ready" as const }),
                status: "building" as const,
                approvedText: block.text,
              },
            }
          : block,
      ),
    };
  }
  if (options?.queuedMessageId) next = dequeueQueuedMessage(next, options.queuedMessageId);
  return { next, title: setup.isFirstTurn ? setup.titleSeed : selected.title };
}

/** The user's message and a notice that the harness is not connected yet. */
function offlineSession(next: Session, turn: PreparedSubmission, setup: TurnSetup, title: string): Session {
  const { visible, visibleText, cards } = setup;
  return {
    ...next,
    title,
    pendingSwitch: undefined,
    busy: false,
    blocks: [
      ...next.blocks,
      ...(turn.queuedFamiliarMessage?.blockId
        ? []
        : [
            {
              id: crypto.randomUUID(),
              role: "user",
              text: visibleText,
              ...(visible.length > 0 ? { attachments: visible } : {}),
              ...cards,
            } as Block,
          ]),
      {
        id: crypto.randomUUID(),
        role: "system",
        text: `${next.harness} is not connected yet — install and sign in to that provider, then retry.`,
        notice: "error",
      },
    ],
  };
}

/** Writes the submitted turn into its session as the user sees it. */
export function submittedSession(s: Session, turn: PreparedSubmission, setup: TurnSetup): Session {
  const { visible, visibleText, cards } = setup;
  const { next, title } = startedSession(s, turn, setup);
  if (!setup.live) return offlineSession(next, turn, setup, title);

  const message = { mode: "new-turn" as const, text: visibleText, attachments: visible, cards };
  const familiarMessage = turn.queuedFamiliarMessage;
  const { pendingSwitch } = turn;
  if (pendingSwitch) {
    const sealed = stopStreaming({ ...next, title, pendingSwitch: undefined });
    const prepared = appendPreparingHandoff(sealed, pendingSwitch.from, next.harness);
    return familiarMessage
      ? acknowledgeFamiliarMessage(prepared, familiarMessage, message)
      : appendUser(prepared, visibleText, visible, cards);
  }
  return familiarMessage
    ? acknowledgeFamiliarMessage({ ...next, title }, familiarMessage, message)
    : appendUser({ ...next, title }, visibleText, visible, cards);
}
