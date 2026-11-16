import { flushSync } from "react-dom";
import type { Session } from "@/domain/session/session";
import { sessionDraftBlock } from "@/domain/session/session-state";
import type { AppSessionListing } from "@/features/agent-app/model/agent-app";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { isHabitRun } from "@/features/familiars/model/familiar-habits";
import { sameProjectPath } from "@/features/projects/model/recents";
import { getSession, listSessionsByProject } from "@/features/sessions/data/session-store";
import type { AgentAppDeps } from "./agent-app-deps";
import type { RequestSource } from "./agent-app-source";

/** A project's sessions as the CLI lists them: saved ones, updated by the open ones. */
export async function listAppSessions(deps: AgentAppDeps, cwd: string): Promise<AppSessionListing[]> {
  const byId = new Map<string, AppSessionListing>();
  for (const session of await listSessionsByProject(cwd)) {
    if (session.orchestrationLeadId || session.taskCardId) continue;
    byId.set(session.id, {
      id: session.id,
      title: session.title,
      harness: session.harness,
      model: session.model,
      busy: false,
      hasDraft: !!session.draft,
      archived: !!session.archived,
    });
  }
  for (const session of deps.sessionsRef.current) {
    if (
      session.orchestrationLeadId ||
      session.taskCardId ||
      isHabitRun(session.id) ||
      !sameProjectPath(session.cwd, cwd)
    )
      continue;
    byId.set(session.id, {
      id: session.id,
      title: session.title,
      harness: session.harness,
      model: session.model,
      busy: !!session.busy,
      hasDraft: !!sessionDraftBlock(session),
      archived: byId.get(session.id)?.archived ?? false,
    });
  }
  return [...byId.values()];
}

/** A session the request may read: open or saved, in a project it can reach. */
export async function readableAppSession(
  deps: AgentAppDeps,
  request: RequestSource,
  id: string,
): Promise<Session | null> {
  const target = deps.sessionsRef.current.find((session) => session.id === id) ?? (await getSession(id));
  return target && !target.orchestrationLeadId && request.canAccessProject(target.cwd) ? target : null;
}

/** A Familiar and its habit runs manage themselves; the CLI cannot stop or remove them. */
function controllable(request: RequestSource, target: Session): boolean {
  return (
    !target.orchestrationLeadId &&
    request.canAccessProject(target.cwd) &&
    !isFamiliarSession(target.id) &&
    !isHabitRun(target.id)
  );
}

export async function stopAppSession(deps: AgentAppDeps, request: RequestSource, id: string): Promise<void> {
  if (deps.removingSessionIds.current.has(id) || deps.switchingWorktrees.current.has(id))
    throw new Error("Session is being removed or changing worktrees");
  const target = deps.sessionsRef.current.find((session) => session.id === id);
  if (!target) {
    request.dismissCompletion(id);
    return;
  }
  if (!controllable(request, target)) throw new Error("Session is unavailable in this project");

  await flushSync(() => deps.stopSession(id));
  deps.flushHarnessEvents();
  request.dismissCompletion(id);
}

export async function removeAppSession(
  deps: AgentAppDeps,
  request: RequestSource,
  id: string,
  mode: "archive" | "delete",
): Promise<void> {
  const target = await deps.ensureOpenSession(id);
  if (!target || !controllable(request, target)) throw new Error("Session is unavailable in this project");

  const removed = await deps.removeSession(id, mode, true, "cli");
  if (!removed)
    throw new Error(
      `Session could not be ${mode === "archive" ? "archived" : "deleted"}; another session operation is in progress`,
    );
  request.dismissCompletion(id);
}
