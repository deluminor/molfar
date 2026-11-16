import type { Session } from "@/domain/session/session";
import type { CiRepairRequest } from "@/features/inbox/model/ci-repair";
import { trackCiRepair } from "@/features/inbox/model/ci-repair-tracking";
import type { InboxItem } from "@/features/inbox/model/github-tasks";
import { sameProjectPath } from "@/features/projects/model/recents";
import { isPreparingHandoff } from "@/features/sessions/model/handoff";
import { newDefaultSession } from "@/features/sessions/model/session";
import { linkedWorkItemFromInboxItem } from "@/features/sessions/model/session-work-item";
import type { InboxDeps } from "./inbox-deps";

/** The chat a CI repair runs in: the chosen one if it can take it, else a new one. */
async function repairSession(
  deps: InboxDeps,
  item: InboxItem,
  cwd: string,
  sessionId?: string,
): Promise<Session> {
  const session = sessionId ? await deps.ensureOpenSession(sessionId) : undefined;
  if (
    sessionId &&
    (!session || session.inboxAsk || session.orchestrationLeadId || !sameProjectPath(session.cwd, cwd))
  ) {
    throw new Error("Choose a chat from this project.");
  }
  if (session && (session.busy || session.pendingSwitch || isPreparingHandoff(session))) {
    throw new Error("This chat is busy. Choose another chat or start a new one.");
  }
  if (session) return session;

  const created = {
    ...newDefaultSession(cwd, deps.runtimeMode()),
    title: `Fix CI #${item.number}: ${item.title}`,
    linkedWorkItem: linkedWorkItemFromInboxItem(item) ?? undefined,
  };
  const next = [...deps.sessionsRef.current, created];
  deps.sessionsRef.current = next;
  deps.setSessions(next);
  return created;
}

/** Asks a chat to fix a PR's failing checks and follows the repair to the end. */
export async function repairChecks(
  deps: InboxDeps,
  item: InboxItem,
  request: CiRepairRequest,
  sessionId?: string,
): Promise<void> {
  const cwd = item.projectPath;
  if (!cwd) throw new Error("Choose a local project for this PR first.");
  const session = await repairSession(deps, item, cwd, sessionId);

  const repairSessionId = session.id;
  trackCiRepair(cwd, request, repairSessionId, (settle) =>
    deps.submit(repairSessionId, request.text, [], {
      ciRepair: request,
      noteCard: undefined,
      handoffCard: undefined,
      onSettled: (outcome) => settle(outcome.status),
    }),
  );
  const { setInboxViewOpen, setNotesViewOpen, setSearchViewOpen } = deps.store.getState();
  setInboxViewOpen(false);
  setNotesViewOpen(false);
  setSearchViewOpen(false);
  deps.setSidebarTab("sessions", cwd);
  await deps.selectHistorySession(session.id);
}
