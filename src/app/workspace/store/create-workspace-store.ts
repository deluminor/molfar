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
    setSessions: fieldSetter(store, "sessions"),
    setTabs: fieldSetter(store, "tabs"),
    setActiveTabId: fieldSetter(store, "activeTabId"),
    setTabVisitNav: fieldSetter(store, "tabVisitNav"),
    setProjectTerminals: fieldSetter(store, "projectTerminals"),
    setLastDockSide: fieldSetter(store, "lastDockSide"),
    setProjectTerminalFocused: fieldSetter(store, "projectTerminalFocused"),
    setHistory: fieldSetter(store, "history"),
    setStoredLinkedSessions: fieldSetter(store, "storedLinkedSessions"),
    setLoadedProjects: fieldSetter(store, "loadedProjects"),
    setHistoryErrorCwd: fieldSetter(store, "historyErrorCwd"),
    setFilesSearchOpen: fieldSetter(store, "filesSearchOpen"),
    setEditorNavigation: fieldSetter(store, "editorNavigation"),
    setFilePickerOpen: fieldSetter(store, "filePickerOpen"),
    setFilePickerInitialQuery: fieldSetter(store, "filePickerInitialQuery"),
    setFilePickerResetToken: fieldSetter(store, "filePickerResetToken"),
    setDirtyFiles: fieldSetter(store, "dirtyFiles"),
    setFileErrorCounts: fieldSetter(store, "fileErrorCounts"),
  }));
}
