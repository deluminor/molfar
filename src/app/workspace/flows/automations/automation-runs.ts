import type { LinkedWorkItem, Session } from "@/domain/session/session";
import { claimInboxAutomationRuns } from "@/features/automations/model/automation-events";
import {
  type Automation,
  type AutomationRun,
  recoverAutomationRuns,
  updateAutomationRun,
} from "@/features/automations/model/automations";
import { looksLikeProject } from "@/features/projects/model/recents";
import {
  loadSessionFolders,
  placeSessionInFolder,
  saveSessionFolders,
} from "@/features/sessions/model/session-folders";
import { linkedWorkItemFromAutomationEvent } from "@/features/sessions/model/session-work-item";
import { newTab } from "@/features/workspace/model/layout";
import { submitWithSettlement } from "../../../model/managed-submission";
import { type AutomationDeps, revealSessions } from "./automation-deps";
import { newAutomationSession, reusableSession, stampedSession } from "./automation-session";
import { launchQuickSession } from "./quick-launch";

type QuickLaunchArgs = Parameters<typeof launchQuickSession> extends [AutomationDeps, ...infer Rest] ? Rest : never;

function runStatus(status: "completed" | "cancelled" | "failed") {
  if (status === "completed") return "succeeded" as const;
  return status === "cancelled" ? ("cancelled" as const) : ("failed" as const);
}

/** Runs automations in sessions, one run per session at a time. */
export function createAutomationRuns(deps: AutomationDeps) {
  const reservations = new Set<string>();
  const recoveryCutoff = Date.now();
  let recovery: Promise<void> | null = null;

  /** The session that takes the run: the automation's last one if free, else a new tab. */
  const sessionForRun = (
    automation: Automation,
    run: AutomationRun,
    reveal: boolean,
    linkedWorkItem: LinkedWorkItem | null | undefined,
  ): Session => {
    const reused = reusableSession(deps.sessionsRef.current, automation, reservations);
    if (!reused) {
      const session = newAutomationSession(automation, run, linkedWorkItem);
      const nextSessions = [...deps.sessionsRef.current, session];
      deps.sessionsRef.current = nextSessions;
      deps.setSessions(nextSessions);
      const tab = newTab(session.id);
      deps.appendTab(tab, automation.cwd);
      if (reveal) {
        deps.selectTab(tab.id);
        deps.setComposerFocused(false);
      }
      return session;
    }

    const stamped = stampedSession(reused, automation, linkedWorkItem);
    const nextSessions = deps.sessionsRef.current.map((entry) => (entry.id === stamped.id ? stamped : entry));
    deps.sessionsRef.current = nextSessions;
    deps.setSessions(nextSessions);
    if (reveal) deps.focusOpenSession(stamped.id);
    return stamped;
  };

  const launch = async (
    automation: Automation,
    run: AutomationRun,
    reveal = false,
    prompt = run.prompt ?? automation.prompt,
    sourceWorkItem?: LinkedWorkItem,
  ): Promise<void> => {
    let reservationId: string | undefined;
    let releaseAfterSettle = false;
    const releaseReservation = () => {
      if (!reservationId) return;
      reservations.delete(reservationId);
      reservationId = undefined;
    };
    try {
      const session = sessionForRun(
        automation,
        run,
        reveal,
        sourceWorkItem ?? linkedWorkItemFromAutomationEvent(run),
      );
      reservationId = session.id;
      reservations.add(session.id);
      if (automation.sessionFolderId && looksLikeProject(automation.cwd)) {
        saveSessionFolders(
          automation.cwd,
          placeSessionInFolder(loadSessionFolders(automation.cwd), session.id, {
            kind: "existing",
            folderId: automation.sessionFolderId,
          }),
        );
      }
      if (reveal) revealSessions(deps, session.cwd);

      await updateAutomationRun(run.id, "running", { sessionId: session.id });
      // From here the settlement callback owns reservation cleanup, including
      // a rejected submission that never starts an agent turn.
      releaseAfterSettle = true;
      await submitWithSettlement({
        submit: (onSettled) =>
          deps.submitSession(session.id, prompt, [], { refreshTitle: run.trigger === "event", onSettled }),
        rejectionMessage: "The selected agent session could not start this run.",
        onSettled: (outcome) => {
          void updateAutomationRun(run.id, runStatus(outcome.status), {
            sessionId: session.id,
            ...(outcome.error ? { error: outcome.error } : {}),
          })
            .catch(() => undefined)
            .finally(releaseReservation);
        },
      });
    } catch (reason: unknown) {
      await updateAutomationRun(run.id, "failed", {
        error: reason instanceof Error ? reason.message : String(reason),
      }).catch(() => undefined);
      throw reason;
    } finally {
      if (!releaseAfterSettle) releaseReservation();
    }
  };

  /** Restarts runs a closed app left running, once per app start. */
  const ensureRecovery = (): Promise<void> => {
    if (!recovery) {
      const recovering = (async () => {
        const pending = await recoverAutomationRuns(recoveryCutoff);
        for (const item of pending) {
          await launch(item.automation, item.run, false, item.run.prompt ?? item.automation.prompt).catch(
            () => undefined,
          );
        }
      })();
      recovery = recovering.catch((error: unknown) => {
        recovery = null;
        throw error;
      });
    }
    return recovery;
  };

  /** New inbox items may trigger event automations. */
  const inboxAppeared = (items: Parameters<typeof claimInboxAutomationRuns>[0]): void => {
    void ensureRecovery()
      .then(() => claimInboxAutomationRuns(items))
      .then((due) => {
        for (const item of due) {
          void launch(item.automation, item.run, false, item.prompt, item.linkedWorkItem).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  };

  return {
    launch,
    ensureRecovery,
    inboxAppeared,
    launchQuick: (...args: QuickLaunchArgs) => launchQuickSession(deps, ...args),
  };
}

export type AutomationRuns = ReturnType<typeof createAutomationRuns>;
