import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { Session } from "@/domain/session/session";

export type WindowTransferPayload = {
  tabs: WorkspaceTab[];
  sessions: Session[];
  activeTabId: string;
  projectCwd: string;
  dirtyFileIds: string[];
  projectTerminals?: ProjectTerminalDock[];
};
