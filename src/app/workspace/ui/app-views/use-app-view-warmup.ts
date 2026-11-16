import { useEffect } from "react";
import { listAutomations } from "@/features/automations/model/automations";
import { loadNotes } from "@/features/notes/notes";
import { preloadNavigationWhenIdle } from "../../../model/preload-navigation";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import type { WorkspaceStore } from "../../store/types";
import { AutomationsView, InboxView, LinkedWorkItemPanel, NotesView } from "./lazy-views";

/** Closes Notes when the setting turns it off and preloads the app views while idle. */
export function useAppViewWarmup(store: WorkspaceStore, notesEnabled: boolean): void {
  const { setNotesViewOpen } = useWorkspaceActions(store);

  useEffect(() => {
    if (!notesEnabled) setNotesViewOpen(false);
  }, [notesEnabled]);

  useEffect(
    () =>
      preloadNavigationWhenIdle([
        InboxView.preload,
        LinkedWorkItemPanel.preload,
        AutomationsView.preload,
        listAutomations,
        ...(notesEnabled ? [NotesView.preload, loadNotes] : []),
      ]),
    [notesEnabled],
  );
}
