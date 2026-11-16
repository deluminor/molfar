import { startTransition } from "react";
import { loadRailSurfaces } from "@/features/settings/model/project-rail";
import { loadNotesEnabled, type SettingsSectionId, saveSettingsSection } from "@/features/settings/model/settings";
import type { SettingsAnchor } from "@/features/settings/ui/SettingsView";
import {
  captureSettingsReturnView,
  restoreSettingsReturnView,
} from "../../../model/settings-return/settings-return-view";
import { closeOverlays, type SurfaceDeps } from "./surface-deps";

/** Opens Settings, remembering the view it covers to return to it on close. */
export function openSettings(deps: SurfaceDeps, section?: SettingsSectionId, anchor?: SettingsAnchor): void {
  deps.cancelNavigation();
  const state = deps.store.getState();
  deps.settingsReturnView.current = captureSettingsReturnView(
    deps.settingsReturnView.current,
    {
      search: state.searchViewOpen,
      inbox: state.inboxViewOpen,
      notes: state.notesViewOpen,
      automations: deps.automationsSurfaceOpen(),
      localSurface: deps.localSurface(),
    },
    state.settingsOpen,
  );
  startTransition(() => {
    const next = deps.store.getState();
    next.setFilePickerOpen(false);
    closeOverlays(deps);
    if (section) {
      next.setSettingsSection(section);
      saveSettingsSection(section);
    }
    next.setSettingsAnchor(anchor ?? null);
    next.setNotificationProjectPath(null);
    next.setSettingsOpen(true);
  });
}

/** Closes Settings back to the view it covered. */
export function closeSettings(deps: SurfaceDeps): void {
  const returnView = restoreSettingsReturnView(deps.settingsReturnView.current, loadNotesEnabled(), loadRailSurfaces());
  const state = deps.store.getState();
  state.setSearchViewOpen(returnView.search);
  state.setInboxViewOpen(returnView.inbox);
  state.setNotesViewOpen(returnView.notes);
  deps.setAutomationsSurfaceOpen(returnView.automations);
  deps.setLocalSurface(returnView.localSurface);
  state.setSettingsOpen(false);
}

/** Opens a project's notification settings. */
export function openNotificationSettings(deps: SurfaceDeps, path?: string): void {
  openSettings(deps, "inbox", "project-notifications");
  const state = deps.store.getState();
  state.setNotificationProjectPath(path ?? null);
  state.setNotificationSettingsRequest((request) => request + 1);
}

export function selectSettingsSection(deps: SurfaceDeps, section: SettingsSectionId): void {
  deps.store.getState().setSettingsSection(section);
  saveSettingsSection(section);
}
