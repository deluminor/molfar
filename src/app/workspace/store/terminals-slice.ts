import type {
  DockSide,
  ProjectTerminalDock,
} from "@/features/projects/model/project-terminal";
import type { StateUpdate } from "./state-update";

export type TerminalsState = {
  /** Each project's terminal dock. */
  projectTerminals: ProjectTerminalDock[];
  /** Side a brand-new project's dock starts on; saved with the workspace. */
  lastDockSide: DockSide | null;
  projectTerminalFocused: boolean;
};

export type TerminalsActions = {
  setProjectTerminals: (update: StateUpdate<ProjectTerminalDock[]>) => void;
  setLastDockSide: (update: StateUpdate<DockSide | null>) => void;
  setProjectTerminalFocused: (update: StateUpdate<boolean>) => void;
};
