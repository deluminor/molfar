import { useEffect } from "react";
import type { ProjectReturnMemory } from "@/features/projects/model/project-return";
import {
  startHarnessBridge,
  stopHarnessTextPrompts,
} from "@/integrations/harness";
import {
  bindResumedSessions,
  isAppQuitting,
  persistQuitState,
  reapWindowRuntime,
  type ResumedWorkspace,
} from "../../../model/app-lifecycle";
import type { createBtw } from "../../flows/btw/btw-actions";
import type { HarnessEventPipeline } from "../../flows/harness-events/harness-event-pipeline";
import type { WorkspaceStateRefs } from "./types";

/** On unmount: aborts every side question and stops the text prompts. Runs before the unload cleanup. */
export function useWorkspaceTeardown(
  btw: Pick<ReturnType<typeof createBtw>, "abortAll">,
): void {
  useEffect(
    () => () => {
      btw.abortAll();
      void stopHarnessTextPrompts();
    },
    [btw],
  );
}

/** Binds resumed chats and runs the harness bridge; a reload saves chats → layout → in-flight, then stops the window's processes. */
export function useWindowUnload(
  resumed: ResumedWorkspace | null,
  readProjectReturnMemory: () => ProjectReturnMemory,
  harnessEvents: Pick<HarnessEventPipeline, "dispose">,
  {
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    lastDockSideRef,
  }: WorkspaceStateRefs,
): void {
  useEffect(() => {
    if (resumed?.sessions.length) bindResumedSessions(resumed.sessions);
    const stopBridge = startHarnessBridge();
    const reap = () => {
      if (isAppQuitting()) return;
      void persistQuitState(
        sessionsRef.current,
        tabsRef.current,
        activeTabIdRef.current,
        projectCwdRef.current,
        readProjectReturnMemory(),
        "unload",
        projectTerminalsRef.current,
        lastDockSideRef.current ?? undefined,
      ).finally(() => {
        void reapWindowRuntime(
          sessionsRef.current,
          tabsRef.current,
          projectTerminalsRef.current,
        );
      });
    };
    window.addEventListener("pagehide", reap);
    window.addEventListener("beforeunload", reap);
    return () => {
      window.removeEventListener("pagehide", reap);
      window.removeEventListener("beforeunload", reap);
      stopBridge();
      harnessEvents.dispose();
    };
  }, [
    resumed,
    readProjectReturnMemory,
    harnessEvents,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    lastDockSideRef,
  ]);
}
