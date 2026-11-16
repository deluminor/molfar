import type { ForegroundView } from "./foreground-session";

export type ForegroundSurface = Pick<ForegroundView, "workspaceVisible" | "standaloneSessionId" | "sideSessionId">;

/** Which conversations the open views leave on screen, for streaming them every frame. */
export function foregroundSurface({
  searchViewOpen,
  inboxViewOpen,
  notesViewOpen,
  automationsViewOpen,
  settingsOpen,
  familiarViewId,
  inboxAskSessionId,
  shownFamiliarSessionId,
}: {
  searchViewOpen: boolean;
  inboxViewOpen: boolean;
  notesViewOpen: boolean;
  automationsViewOpen: boolean;
  settingsOpen: boolean;
  familiarViewId: string | null;
  inboxAskSessionId: string | undefined;
  shownFamiliarSessionId: string | undefined;
}): ForegroundSurface {
  const otherViewOpen = searchViewOpen || notesViewOpen || automationsViewOpen || settingsOpen;
  const workspaceVisible = !otherViewOpen && !inboxViewOpen && !familiarViewId;
  if (inboxViewOpen) return { workspaceVisible, standaloneSessionId: inboxAskSessionId };
  if (otherViewOpen) return { workspaceVisible };

  return {
    workspaceVisible,
    standaloneSessionId: familiarViewId ?? undefined,
    sideSessionId: shownFamiliarSessionId,
  };
}
