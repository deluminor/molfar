import { useEffect, useRef } from "react";
import type { SessionPersistence } from "../../flows/session-history/session-persistence";
import type { ResumedWorkspace } from "../../../model/app-lifecycle";
import type { WindowTransferPayload } from "../../../model/window-transfer";

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
