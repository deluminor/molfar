import type { StoreApi } from "zustand/vanilla";
import type { HistoryActions, HistoryState } from "./history-slice";
import type { ProjectsActions, ProjectsState } from "./projects-slice";
import type { SessionsActions, SessionsState } from "./sessions-slice";
import type { TabsActions, TabsState } from "./tabs-slice";
import type { TerminalsActions, TerminalsState } from "./terminals-slice";

export type WorkspaceInitialState = ProjectsState &
  SessionsState &
  TabsState &
  TerminalsState &
  HistoryState;

export type WorkspaceActions = ProjectsActions &
  SessionsActions &
  TabsActions &
  TerminalsActions &
  HistoryActions;

export type WorkspaceState = WorkspaceInitialState & WorkspaceActions;

export type WorkspaceStore = StoreApi<WorkspaceState>;
