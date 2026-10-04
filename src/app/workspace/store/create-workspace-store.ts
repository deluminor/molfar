import { createStore } from "zustand/vanilla";
import { fieldSetter } from "./field-setter";
import type {
  WorkspaceInitialState,
  WorkspaceState,
  WorkspaceStore,
} from "./types";

/** The Workspace's state outside React, so flows can read and update it. */
export function createWorkspaceStore(
  initial: WorkspaceInitialState,
): WorkspaceStore {
  return createStore<WorkspaceState>()((_set, _get, store) => ({
    ...initial,
    setProjectCwd: fieldSetter(store, "projectCwd"),
    setRecents: fieldSetter(store, "recents"),
  }));
}
