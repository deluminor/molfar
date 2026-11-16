import { flushSync } from "react-dom";
import type { AppSessionPlacement } from "@/features/agent-app/model/agent-app";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { sameProjectPath } from "@/features/projects/model/recents";
import type { QuickLaunch } from "@/features/quick-composer/model/quick-composer";
import { leafIds, type SplitDir, splitPane } from "@/features/workspace/model/layout";
import { submitWithSettlement } from "../../../model/managed-submission";
import { acceptQuickLaunch } from "../../../model/quick-launch-session";
import { type AutomationDeps, revealSessions } from "./automation-deps";

/** Splits the launched session into the pane beside an open session of the same project. */
function placeBeside(
  deps: AutomationDeps,
  launch: QuickLaunch,
  sessionId: string,
  target: { direction: SplitDir; besideSessionId: string },
  cwd: string,
): string {
  const anchor = deps.sessionsRef.current.find((session) => session.id === target.besideSessionId);
  const tab = deps.tabsRef.current.find((entry) => leafIds(entry.layout).includes(target.besideSessionId));
  if (!anchor || !sameProjectPath(anchor.cwd, cwd) || !tab)
    throw new Error("The target session must be open in this project");

  const nextTabs = deps.tabsRef.current.map((entry) =>
    entry.id === tab.id
      ? {
          ...entry,
          layout: splitPane(entry.layout, target.besideSessionId, target.direction, sessionId),
          focusedId: launch.reveal ? sessionId : entry.focusedId,
          diffFocused: launch.reveal ? false : entry.diffFocused,
        }
      : entry,
  );
  deps.tabsRef.current = nextTabs;
  deps.store.getState().setTabs(nextTabs);
  return tab.id;
}

/** Opens a session from the quick composer, the Task Board or the app CLI and sends its prompt. */
export function launchQuickSession(
  deps: AutomationDeps,
  launch: QuickLaunch,
  deliveryId: string,
  placement?: AppSessionPlacement,
  onSettled?: (outcome: ControlOutcome) => void,
  openTab?: boolean,
) {
  const { setProjectCwd, setRecents } = deps.store.getState();
  return acceptQuickLaunch(
    launch,
    deliveryId,
    {
      getSessions: () => deps.sessionsRef.current,
      updateSessions: (update) => {
        deps.sessionsRef.current = update(deps.sessionsRef.current);
        // Compose with submission's queued transcript updates.
        deps.setSessions(update);
      },
      appendTab: (tab, cwd) => deps.appendTab(tab, cwd),
      placeSession: (sessionId, target, cwd) => placeBeside(deps, launch, sessionId, target, cwd),
      setProjectCwd,
      setRecents,
      revealTab: (id, cwd) => {
        deps.selectTab(id);
        deps.setComposerFocused(false);
        revealSessions(deps, cwd);
      },
      submit: (id, text, attachments, options) =>
        onSettled
          ? submitWithSettlement({
              submit: (settle) =>
                deps.submitSession(id, text, attachments, { ...options, appRequestId: deliveryId, onSettled: settle }),
              onSettled,
              rejectionMessage: "The monitored session could not start.",
            })
          : deps.submitSession(id, text, attachments, options),
      saveDraft: (id, prompt, attachments, requestId) =>
        flushSync(() => deps.saveDraft(id, prompt, attachments, requestId)),
    },
    placement,
    openTab,
  );
}
