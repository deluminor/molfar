import { HARNESS_LABEL } from "@/domain/harness/harness";
import type { LinkedWorkItem, Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { formatSessionTitle } from "@/domain/session/title";
import type { Automation, AutomationRun } from "@/features/automations/model/automations";
import { newSession } from "@/features/sessions/model/session";
import { pathKey } from "@/shared/lib/paths";

/** Whether the automation's last session can take this run in the checkout it asks for. */
function fitsCheckout(entry: Session, automation: Automation): boolean {
  if (automation.workspaceMode === "current") {
    return entry.workspaceMode !== "worktree" && !entry.worktreeCwd && pathKey(entry.cwd) === pathKey(automation.cwd);
  }
  if (automation.workspaceMode === "existing") {
    return pathKey(sessionWorkCwd(entry)) === pathKey(automation.worktreeCwd ?? "");
  }
  return false;
}

/** The automation's last session, when it reuses sessions and that one is free. */
export function reusableSession(
  sessions: Session[],
  automation: Automation,
  reserved: ReadonlySet<string>,
): Session | undefined {
  if (!automation.reuseSession || !automation.lastSessionId) return undefined;
  return sessions.find(
    (entry) =>
      entry.id === automation.lastSessionId &&
      entry.harness === automation.harness &&
      !entry.busy &&
      !entry.worktreeRemoved &&
      !reserved.has(entry.id) &&
      fitsCheckout(entry, automation),
  );
}

function checkout(automation: Automation): Partial<Session> {
  if (automation.workspaceMode === "worktree") return { workspaceMode: "worktree", worktreeBase: "HEAD" };
  if (automation.workspaceMode === "existing" && automation.worktreeCwd) {
    return { worktreeCwd: automation.worktreeCwd };
  }
  return {};
}

/** A new session for the run; an event run is titled after its work later. */
export function newAutomationSession(
  automation: Automation,
  run: AutomationRun,
  linkedWorkItem: LinkedWorkItem | null | undefined,
): Session {
  return {
    ...newSession(
      automation.harness,
      automation.cwd,
      automation.model,
      automation.runtimeMode,
      automation.modelSettings,
    ),
    title:
      run.trigger === "event"
        ? HARNESS_LABEL[automation.harness]
        : formatSessionTitle(automation.harness, automation.name),
    automationId: automation.id,
    ...(linkedWorkItem ? { linkedWorkItem } : {}),
    ...checkout(automation),
  };
}

/** The reused session, set up as the automation asks. */
export function stampedSession(
  session: Session,
  automation: Automation,
  linkedWorkItem: LinkedWorkItem | null | undefined,
): Session {
  return {
    ...session,
    automationId: automation.id,
    model: automation.model,
    modelSettings: automation.modelSettings ?? {},
    runtimeMode: automation.runtimeMode,
    ...(linkedWorkItem ? { linkedWorkItem } : {}),
  };
}
