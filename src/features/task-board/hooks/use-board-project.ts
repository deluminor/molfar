import { useSyncExternalStore } from "react";
import {
  saveBoardProject,
  savedBoardProject,
  shownBoardProject,
  subscribeBoardProject,
} from "../model/board-project";

export type BoardProject = readonly [
  project: string | null,
  setProject: (project: string | null) => void,
];

/** The board's project scope; it outlives the board view and the app run. */
export function useBoardProject(projects: readonly string[]): BoardProject {
  const saved = useSyncExternalStore(
    subscribeBoardProject,
    savedBoardProject,
    savedBoardProject,
  );

  return [shownBoardProject(saved, projects), saveBoardProject];
}
