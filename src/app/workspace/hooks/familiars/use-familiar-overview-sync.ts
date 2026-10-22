import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { ARTIFACT_DELETED_EVENT, removeArtifactCard } from "@/features/artifacts/artifacts";
import { forgetOverviewDocument, leaveOverviewItems } from "../../flows/familiars/familiar-overview";
import type { WorkspaceStore } from "../../store/types";
import { useWorkspaceField } from "../use-workspace-field";
import type { WorkspaceSessions } from "../use-workspace-sessions";

/** Drops deleted artifacts from chats and the overview; hiding the overview leaves what was open over its list. */
export function useFamiliarOverviewSync(
  store: WorkspaceStore,
  sessionsRef: WorkspaceSessions["sessionsRef"],
  setSessions: WorkspaceSessions["setSessions"],
): void {
  const familiarOverviewOpen = useWorkspaceField(store, "familiarOverviewOpen");

  useEffect(() => {
    const listening = listen<string>(
      ARTIFACT_DELETED_EVENT,
      ({ payload: id }) => {
        const previous = sessionsRef.current;
        const updated = previous.map((session) =>
          removeArtifactCard(session, id),
        );
        if (updated.some((session, index) => session !== previous[index])) {
          sessionsRef.current = updated;
          setSessions(updated);
        }
        forgetOverviewDocument(store, id);
      },
    );
    return () => {
      void listening.then((unlisten) => unlisten());
    };
  }, [store, sessionsRef, setSessions]);
  useEffect(() => {
    if (!familiarOverviewOpen) leaveOverviewItems(store);
  }, [familiarOverviewOpen, store]);
}
