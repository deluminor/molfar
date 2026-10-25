import { useEffect, useRef } from "react";
import { openSessionIds } from "../../../model/session-id-sets";
import type { SessionPersistence } from "../../flows/session-history/session-persistence";
import type { WorkspaceSessions } from "../use-workspace-sessions";
import type { ResumedWorkspace } from "../../../model/app-lifecycle";
import type { WindowTransferPayload } from "../../../model/window-transfer";
import type { WorkspaceTab } from "@/features/workspace/model/layout";

/** Restored or transferred chats arrive saved, so the first autosave pass must not rewrite them. */
export function useImportedSessionMarks(
  persistence: Pick<SessionPersistence, "markImported">,
  windowTransfer: WindowTransferPayload | null,
  resumed: ResumedWorkspace | null,
): void {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    const imported = windowTransfer?.sessions ?? resumed?.sessions;
    if (!imported?.length) return;
    applied.current = true;
    for (const session of imported) persistence.markImported(session);
  }, [windowTransfer, resumed, persistence]);
}

/** Writes changed chats 650 ms after the last change; a new turn or bound provider thread writes at once. */
export function useSessionAutosave(
  persistence: Pick<SessionPersistence, "observe" | "writePending">,
  sessionState: Pick<WorkspaceSessions["sessionState"], "snapshot" | "observe">,
  tabsRef: { readonly current: WorkspaceTab[] },
): void {
  useEffect(() => {
    let timer: number | undefined;
    const observe = () => {
      if (
        !persistence.observe(
          sessionState.snapshot(),
          openSessionIds(tabsRef.current),
        )
      )
        return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(
        () => void persistence.writePending(),
        650,
      );
    };
    observe();
    const unsubscribe = sessionState.observe(observe);
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [persistence, sessionState, tabsRef]);
}
