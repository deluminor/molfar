import type { WorkspaceActions, WorkspaceStore } from "../store/types";

/**
 * The store's actions. They are created once with the store and never
 * change, like React's setState functions (biome.json marks the result stable).
 */
export function useWorkspaceActions(store: WorkspaceStore): WorkspaceActions {
  return store.getState();
}
