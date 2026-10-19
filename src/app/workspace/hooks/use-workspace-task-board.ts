import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo } from "react";
import { companionProjectPaths } from "@/features/companion/model/companion-projects";
import { syncBoardDockBadge } from "@/features/notifications/model/dock-badge";
import { useBoardAttention } from "@/features/task-board/hooks/use-board-attention";
import {
  type TaskBoardRuntime,
  useTaskBoardEngine,
} from "@/features/task-board/hooks/use-task-board-engine";
import {
  createTaskBoardSessionPort,
  type TaskBoardSessionDeps,
} from "../../model/task-board-session-port";
import { useStableFlow } from "./use-stable-flow";

export type WorkspaceTaskBoard = {
  taskBoard: TaskBoardRuntime;
  isMainWindow: boolean;
  railBadges: { board: number };
};

/**
 * Runs the Task Board engine on the window's sessions. The deps are read once,
 * so they must reach the latest workspace through refs.
 */
export function useWorkspaceTaskBoard(
  deps: Omit<TaskBoardSessionDeps, "wait">,
): WorkspaceTaskBoard {
  const sessions = useStableFlow(() =>
    createTaskBoardSessionPort({
      ...deps,
      wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    }),
  );
  const isMainWindow = useStableFlow(() => getCurrentWindow().label === "main");
  const taskBoard = useTaskBoardEngine(sessions, isMainWindow, companionProjectPaths);
  const boardAttention = useBoardAttention(taskBoard.ports.store);
  const railBadges = useMemo(() => ({ board: boardAttention }), [boardAttention]);

  useEffect(() => {
    if (isMainWindow) syncBoardDockBadge(boardAttention);
  }, [boardAttention]);

  return { taskBoard, isMainWindow, railBadges };
}
