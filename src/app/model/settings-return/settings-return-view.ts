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
): SettingsReturnView {
  return { ...snapshot, notes: snapshot.notes && notesEnabled };
}
