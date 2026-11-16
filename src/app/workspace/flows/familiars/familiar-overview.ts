import type { Block } from "@/domain/session/block";
import type { WorkspaceStore } from "../../store/types";

/** A document opened from the chat shows on the overview's Documents tab, the same page the tab opens it on. */
export function openOverviewDocument(store: WorkspaceStore, documentId: string): void {
  const state = store.getState();
  state.setFamiliarShownSession(null);
  state.setFamiliarOverviewDocument(documentId);
  state.setFamiliarOverviewTab("documents");
  state.setFamiliarOverviewOpen(true);
}

/** A deleted document no longer shows over the overview's list. */
export function forgetOverviewDocument(store: WorkspaceStore, documentId: string): void {
  store
    .getState()
    .setFamiliarOverviewDocument((current) => (current === documentId ? null : current));
}

/** Hiding the overview leaves what was open over its list, so it opens on its list again. */
export function leaveOverviewItems(store: WorkspaceStore): void {
  const state = store.getState();
  state.setFamiliarShownSession(null);
  state.setFamiliarOverviewDocument(null);
}

/** A turn's activity shows on the overview's Activity tab; picking the shown one again clears it. */
export function showFamiliarActivity(
  store: WorkspaceStore,
  sessionId: string,
  turnId: string,
  blocks: Block[],
): void {
  const state = store.getState();
  const shown = state.familiarOverviewOpen && state.familiarOverviewTab === "activity";

  leaveOverviewItems(store);
  state.setFamiliarOverviewTab("activity");
  state.setFamiliarOverviewOpen(true);
  state.setFamiliarActivity((previous) =>
    shown && previous?.sessionId === sessionId && previous.turnId === turnId
      ? null
      : { sessionId, turnId, blocks },
  );
}
