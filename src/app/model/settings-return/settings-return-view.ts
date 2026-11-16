import type { RailSurfaceVisibility } from "@/features/settings/model/project-rail";
import type { SettingsReturnView } from "./types";

export function captureSettingsReturnView(
  previous: SettingsReturnView,
  current: SettingsReturnView,
  settingsOpen: boolean,
): SettingsReturnView {
  if (settingsOpen) return previous;

  return { ...current };
}

export function restoreSettingsReturnView(
  snapshot: SettingsReturnView,
  notesEnabled: boolean,
  railSurfaces: RailSurfaceVisibility,
): SettingsReturnView {
  const localSurfaceVisible =
    snapshot.localSurface !== null && railSurfaces[snapshot.localSurface];

  return {
    ...snapshot,
    notes: snapshot.notes && notesEnabled,
    localSurface: localSurfaceVisible ? snapshot.localSurface : null,
  };
}
