import type { Session } from "@/domain/session/session";
import { dropRelays, relayApproval } from "@/features/familiars/model/familiar-habits";
import { announceSessionFinished } from "@/features/notifications/model/notifications";
import { deleteSession } from "@/features/sessions/data/session-store";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import { forgetHarnessSession } from "@/integrations/harness";
import type { FamiliarHabitHost } from "../../../hooks/use-familiar-habits";
import { submitWithSettlement } from "../../../model/managed-submission";
import type { SubmissionAcceptance } from "../../../model/submission-acceptance";
import type { Submit } from "../submission/submit-types";
import type { FamiliarChat } from "./familiar-chat";

export type FamiliarHabitHostDeps = {
  sessionsRef: { current: Session[] };
  activeSessionIdRef: { readonly current: string | undefined };
  chat: FamiliarChat;
  commitSessions(next: Session[]): void;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  submitSession(...args: Parameters<Submit>): SubmissionAcceptance;
  stopSessionForRemoval(sessionId: string): Promise<Session | undefined>;
  noteReply(familiarSessionId: string): void;
};

/** Runs Familiar habits against the workspace: hidden run sessions, chat posts and relayed approvals. */
export function createFamiliarHabitHost(deps: FamiliarHabitHostDeps): FamiliarHabitHost {
  return {
    sessions: () => deps.sessionsRef.current,
    open: async (id) => (await deps.ensureOpenSession(id)) ?? undefined,
    add: (session) => deps.commitSessions([...deps.sessionsRef.current, session]),
    run: (id, prompt) =>
      new Promise((resolve) => {
        void submitWithSettlement({
          submit: (onSettled) => deps.submitSession(id, prompt, [], { onSettled }),
          onSettled: resolve,
          rejectionMessage: "The habit's run could not start.",
        });
      }),
    remove: async (id) => {
      const open = await deps.stopSessionForRemoval(id);
      if (open) await Promise.all(sessionChildHarnesses(open).map((harness) => forgetHarnessSession(harness, id)));
      await deleteSession(id, []);
      deps.commitSessions(deps.sessionsRef.current.filter((session) => session.id !== id));
    },
    post: (familiarId, habit, text, name, artifacts, launches) =>
      deps.chat.append(
        familiarId,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text,
          familiarHabit: { id: habit.id, name: habit.name, at: Date.now() },
          ...(artifacts?.length ? { artifactCards: artifacts } : {}),
          ...(launches?.length ? { familiarSpawnedSessions: launches } : {}),
        },
        (posted) => {
          deps.noteReply(familiarId);
          void announceSessionFinished({ ...posted, title: name }, familiarId === deps.activeSessionIdRef.current);
        },
      ),
    // The chat shows it like any approval, and the usual approval banner
    // fires for the Familiar; the answer is routed back in onApproval.
    askApproval: (familiarId, habit, runId, block) => {
      if (!block.approval) return;

      const blockId = crypto.randomUUID();
      const requestId = relayApproval({ familiarId, runId, requestId: block.approval.requestId, blockId });
      deps.chat.append(familiarId, {
        id: blockId,
        role: "approval",
        text: block.text,
        ...(block.tool ? { tool: block.tool } : {}),
        approval: { requestId },
        familiarHabit: { id: habit.id, name: habit.name, at: Date.now() },
      });
    },
    endApprovals: (runId) => {
      for (const relay of dropRelays(runId)) deps.chat.decide(relay.familiarId, relay.blockId, "cancelled");
    },
  };
}
