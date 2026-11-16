import type { Session } from "@/domain/session/session";
import type {
  DockSide,
  ProjectTerminalDock,
} from "@/features/projects/model/project-terminal";
import type { WorkspaceTab } from "@/features/workspace/model/layout";

/** Latest workspace state, read when the window unloads, closes or quits. */
export type WorkspaceStateRefs = {
  sessionsRef: { readonly current: Session[] };
  tabsRef: { readonly current: WorkspaceTab[] };
  activeTabIdRef: { readonly current: string };
  projectCwdRef: { readonly current: string };
  projectTerminalsRef: { readonly current: ProjectTerminalDock[] };
  lastDockSideRef: { readonly current: DockSide | null };
};
