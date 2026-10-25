import type { Session } from "@/domain/session/session";
import type {
  DockSide,
  ProjectTerminalDock,
} from "@/features/projects/model/project-terminal";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../store/types";

export type TerminalDeps = {
  store: WorkspaceStore;
  projectCwd(): string;
  sidebarCwd(): string;
  /** Where a new terminal starts: the active file's or conversation's folder. */
  terminalCwd(): string;
  docks(): ProjectTerminalDock[];
  lastDockSide(): DockSide | null;
  tabs(): WorkspaceTab[];
  sessions(): Session[];
  activeTabId(): string;
  setComposerFocused(focused: boolean): void;
  /** Activates a tab as a click does, leaving views over the workspace. */
  selectTab(tabId: string): void;
  appendTab(tab: WorkspaceTab, cwd?: string): void;
  leaveCoveringFamiliar(): void;
  /** Forgets a blank conversation a terminal takes the place of. */
  dropBlankSession(session: Session): void;
  confirmCloseTerminal(file: ProjectTerminalDock["pane"]["files"][number]): Promise<boolean>;
  confirmCloseTerminals(files: ProjectTerminalDock["pane"]["files"]): Promise<boolean>;
};
