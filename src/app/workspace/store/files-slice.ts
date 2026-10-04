import type { EditorNavigationTarget } from "@/features/search/model/search";
import type { StateUpdate } from "./state-update";

export type FilesState = {
  /** Find in Files panel in the explorer. */
  filesSearchOpen: boolean;
  /** Where the editor should jump next, e.g. a search match. */
  editorNavigation: EditorNavigationTarget | null;
  filePickerOpen: boolean;
  filePickerInitialQuery: string;
  /** Bumped to clear the picker when it reopens. */
  filePickerResetToken: number;
  /** Files with unsaved edits; carried across a window transfer. */
  dirtyFiles: Set<string>;
  /**
   * Lint errors per file. Not carried across a window transfer the way dirty
   * state is: the editor re-lints whatever it mounts, so the counts rebuild.
   */
  fileErrorCounts: Map<string, number>;
};

export type FilesActions = {
  setFilesSearchOpen: (update: StateUpdate<boolean>) => void;
  setEditorNavigation: (
    update: StateUpdate<EditorNavigationTarget | null>,
  ) => void;
  setFilePickerOpen: (update: StateUpdate<boolean>) => void;
  setFilePickerInitialQuery: (update: StateUpdate<string>) => void;
  setFilePickerResetToken: (update: StateUpdate<number>) => void;
  setDirtyFiles: (update: StateUpdate<Set<string>>) => void;
  setFileErrorCounts: (update: StateUpdate<Map<string, number>>) => void;
};
