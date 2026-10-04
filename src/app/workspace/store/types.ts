import type { StoreApi } from "zustand/vanilla";
import type { ProjectsActions, ProjectsState } from "./projects-slice";
import type { SessionsActions, SessionsState } from "./sessions-slice";
import type { TabsActions, TabsState } from "./tabs-slice";

export type WorkspaceInitialState = ProjectsState & SessionsState & TabsState;

export type WorkspaceActions = ProjectsActions & SessionsActions & TabsActions;

export type WorkspaceState = WorkspaceInitialState & WorkspaceActions;

export type WorkspaceStore = StoreApi<WorkspaceState>;
