import type { RecentProject } from "@/features/projects/model/recents";
import type { StateUpdate } from "./state-update";

export type ProjectsState = {
  /** Project the workspace shows. */
  projectCwd: string;
  recents: RecentProject[];
};

export type ProjectsActions = {
  setProjectCwd: (update: StateUpdate<string>) => void;
  setRecents: (update: StateUpdate<RecentProject[]>) => void;
};

export type ProjectsSlice = ProjectsState & ProjectsActions;
