import { startTransition } from "react";
import { rememberProject } from "@/features/projects/model/recents";
import { loadNotesEnabled } from "@/features/settings/model/settings";
import type { AppView } from "@/features/workspace/model/app-view-tabs";
import { closeOverlays, type SurfaceDeps } from "./surface-deps";

function showView(deps: SurfaceDeps, view: AppView): void {
  const state = deps.store.getState();
  closeOverlays(deps);
  if (view === "search") {
    state.setSearchViewOpen(true);
    state.setSearchViewFocusToken((token) => token + 1);
  } else if (view === "inbox") {
    state.setInboxViewOpen(true);
  } else if (view === "notes") {
    state.setNotesViewOpen(true);
  } else {
    deps.setAutomationsViewOpen(true);
  }
}

/**
 * Opens one of the app views over the workspace. The Familiar closes in the
 * same commit, so no frame shows the workspace tab between the two views.
 */
export function openAppView(deps: SurfaceDeps, view: AppView): void {
  deps.cancelNavigation();
  if (view === "notes" && !loadNotesEnabled()) return;
  startTransition(() => {
    deps.closeFamiliarView();
    deps.rememberAppView(view);
    const state = deps.store.getState();
    state.setFilePickerOpen(false);
    state.setSettingsOpen(false);
    showView(deps, view);
  });
}

/** Opens the file picker, or with ">" the command palette. */
export function openFilePicker(deps: SurfaceDeps, query: string): void {
  closeOverlays(deps);
  const state = deps.store.getState();
  state.setFilePickerInitialQuery(query);
  state.setFilePickerResetToken((token) => token + 1);
  state.setFilePickerOpen(true);
}

export function findInProject(deps: SurfaceDeps): void {
  closeOverlays(deps);
  deps.setSidebarTab("files");
  const state = deps.store.getState();
  state.setFilesSearchOpen(true);
  state.setSearchFocusToken((token) => token + 1);
}

/** Leaves the automations view for a conversation one of its runs started. */
export async function openAutomationSession(deps: SurfaceDeps, sessionId: string): Promise<void> {
  const session = await deps.ensureOpenSession(sessionId);
  if (!session) throw new Error("This conversation is no longer available.");
  const state = deps.store.getState();
  deps.setAutomationsViewOpen(false);
  state.setSearchViewOpen(false);
  state.setInboxViewOpen(false);
  state.setNotesViewOpen(false);
  state.setSettingsOpen(false);
  state.setFilePickerOpen(false);
  deps.setSidebarTab("sessions", session.cwd);
  state.setProjectCwd(session.cwd);
  state.setRecents(rememberProject(session.cwd));
  await deps.selectHistorySession(sessionId);
}

/** The rail's back button leaves the open view first, then visits the previous tab. */
export function railBack(deps: SurfaceDeps, closeSettings: () => void): void {
  const state = deps.store.getState();
  if (state.settingsOpen) {
    closeSettings();
    return;
  }
  if (state.searchViewOpen) {
    state.setSearchViewOpen(false);
    return;
  }
  if (state.inboxViewOpen) {
    state.setInboxViewOpen(false);
    return;
  }
  if (state.notesViewOpen) {
    state.setNotesViewOpen(false);
    return;
  }
  if (deps.automationsSurfaceOpen() || deps.localSurface() !== null) {
    deps.setAutomationsViewOpen(false);
    return;
  }
  if (state.familiarViewId) {
    deps.closeFamiliarView();
    deps.setComposerFocused(true);
    return;
  }
  deps.visitBack();
}

export function railForward(deps: SurfaceDeps): void {
  const state = deps.store.getState();
  state.setSearchViewOpen(false);
  state.setSettingsOpen(false);
  state.setInboxViewOpen(false);
  state.setNotesViewOpen(false);
  deps.setAutomationsViewOpen(false);
  deps.visitForward();
}
