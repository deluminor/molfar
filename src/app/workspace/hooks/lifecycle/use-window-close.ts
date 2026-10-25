import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import type { Session } from "@/domain/session/session";
import type { ProjectReturnMemory } from "@/features/projects/model/project-return";
import { loadCloseToTray } from "@/features/settings/model/settings";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { IS_MAC } from "@/shared/lib/platform";
import {
  closeBusyWindow,
  closeCurrentWindow,
  hasInFlightSessions,
  hideCurrentWindow,
  persistLiveTranscripts,
  persistQuitState,
  setQuitWorkspace,
} from "../../../model/app-lifecycle";
import type { WorkspaceStateRefs } from "./types";

const TRANSCRIPT_WAIT_MS = 2_000;

/** Hides once the live transcripts are written; a hung write cannot keep the window up past the wait. */
async function hideAfterTranscripts(sessions: Session[]): Promise<void> {
  let timer: number | undefined;
  const timedOut = new Promise<"timed-out">((resolve) => {
    timer = window.setTimeout(() => resolve("timed-out"), TRANSCRIPT_WAIT_MS);
  });
  const outcome = await Promise.race([persistLiveTranscripts(sessions), timedOut]);
  window.clearTimeout(timer);

  if (outcome === "timed-out") {
    console.warn("Hiding the window before its transcripts finished saving");
  } else {
    for (const result of outcome) {
      if (result.status === "rejected") {
        console.warn("Could not save a live transcript before hiding the window", result.reason);
      }
    }
  }

  await hideCurrentWindow();
}

/**
 * Hands the coordinated quit its getters and owns the window's close button:
 * a kept-alive macOS Familiar or a running chat saves its transcripts and then
 * hides the window, an idle one saves chats → layout and then hides (tray) or closes.
 */
export function useWindowClose(
  readProjectReturnMemory: () => ProjectReturnMemory,
  flushHarnessEvents: () => void,
  keepWorkspaceTab: (tab: WorkspaceTab) => boolean,
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
    let unlistenClose: (() => void) | undefined;
    const releaseQuit = setQuitWorkspace(
      () => sessionsRef.current,
      () => tabsRef.current,
      () => activeTabIdRef.current,
      () => projectCwdRef.current,
      () => projectTerminalsRef.current,
      readProjectReturnMemory,
      flushHarnessEvents,
      () => lastDockSideRef.current,
      keepWorkspaceTab,
    );
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        // Listening here makes close our job. Letting the default path run
        // calls JS `window.destroy`, which Tauri denies without a permission.
        event.preventDefault();
        if (
          IS_MAC &&
          (await invoke<boolean>("familiar_chat_keep_alive").catch(() => false))
        ) {
          flushHarnessEvents();
          await hideAfterTranscripts(sessionsRef.current);
          return;
        }
        const toTray = loadCloseToTray();
        if (hasInFlightSessions(sessionsRef.current)) {
          flushHarnessEvents();
          if (!toTray && !IS_MAC) {
            void closeBusyWindow();
            return;
          }
          // Not `persistQuitState`: that marks the live turns interrupted.
          await hideAfterTranscripts(sessionsRef.current);
          return;
        }
        void persistQuitState(
          sessionsRef.current,
          tabsRef.current,
          activeTabIdRef.current,
          projectCwdRef.current,
          readProjectReturnMemory(),
          "unload",
          projectTerminalsRef.current,
          lastDockSideRef.current ?? undefined,
          keepWorkspaceTab,
        ).finally(() => {
          void (toTray ? hideCurrentWindow() : closeCurrentWindow());
        });
      })
      .then((fn) => {
        unlistenClose = fn;
      });
    return () => {
      releaseQuit();
      unlistenClose?.();
    };
  }, [
    flushHarnessEvents,
    keepWorkspaceTab,
    readProjectReturnMemory,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    lastDockSideRef,
  ]);
}
