import { useEffect, useRef } from "react";
import type { Session } from "@/domain/session/session";
import { replaceInFlightSessions } from "@/features/sessions/data/session-store";
import {
  inFlightRefs,
  inFlightSnapshotKey,
  shouldWriteInFlightSnapshot,
} from "@/features/sessions/model/in-flight";
import type { WorkspaceTab } from "@/features/workspace/model/layout";

/** Records the running turns on change, so a crash can mark them interrupted; cleared once after a run. */
export function useInFlightSnapshot(sessions: Session[], tabs: WorkspaceTab[]): void {
  const inFlightSyncKey = useRef<string | null>(null);
  const sawInFlight = useRef(false);

  useEffect(() => {
    const refs = inFlightRefs(sessions, tabs);
    if (refs.length > 0) sawInFlight.current = true;
    const key = inFlightSnapshotKey(refs);
    if (
      !shouldWriteInFlightSnapshot(
        key,
        refs,
        inFlightSyncKey.current,
        sawInFlight.current,
      )
    ) {
      return;
    }
    inFlightSyncKey.current = key;
    void replaceInFlightSessions(refs).catch(() => undefined);
  }, [sessions, tabs]);
}
