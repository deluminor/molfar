import type { StoreApi } from "zustand/vanilla";
import type {
  ProjectsActions,
  ProjectsSlice,
  ProjectsState,
} from "./projects-slice";

export type WorkspaceState = ProjectsSlice;

export type WorkspaceInitialState = ProjectsState;

export type WorkspaceActions = ProjectsActions;

export type WorkspaceStore = StoreApi<WorkspaceState>;
