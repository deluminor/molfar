import type { Session } from "@/domain/session/session";
import {
  remotePendingWorktree,
  remoteSessionFor,
} from "@/features/connections/model/connections";
import { isBlankSession } from "@/features/projects/model/project-return";
import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";

/** One fresh local conversation and nothing else open. */
export function isBlankWorkspaceTab(tab: WorkspaceTab, sessions: Session[]): boolean {
  if (tab.editorPanes.some((pane) => pane.files.length > 0)) return false;
  if ((tab.terminalPanes ?? []).some((pane) => pane.files.length > 0)) return false;

  const ids = leafIds(tab.layout);
  if (ids.length !== 1) return false;
  if (remoteSessionFor(ids[0]) || remotePendingWorktree(ids[0])) return false;

  return isBlankSession(sessions.find((entry) => entry.id === ids[0]));
}
