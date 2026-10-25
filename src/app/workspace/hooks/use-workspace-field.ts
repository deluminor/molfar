import { useStore } from "zustand";
import type {
  WorkspaceInitialState,
  WorkspaceState,
  WorkspaceStore,
} from "../store/types";

/** One field of the workspace store; the component re-renders when it changes. */
export function useWorkspaceField<K extends keyof WorkspaceInitialState>(
  store: WorkspaceStore,
  key: K,
): WorkspaceState[K] {
  return useStore(store, (state) => state[key]);
}
