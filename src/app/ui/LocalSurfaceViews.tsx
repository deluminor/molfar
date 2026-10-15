import type { ReactNode } from "react";
import { HomeView } from "../../features/home/ui/HomeView";
import type { LocalSurfaceId } from "../../features/home/ui/LocalSurfaceRailActions";
import { KnowledgeView } from "../../features/knowledge/ui/KnowledgeView";
import { UsageView } from "../../features/usage/ui/UsageView";
import type { TaskBoardRuntime } from "../../features/task-board/hooks/use-task-board-engine";
import { lazySurface } from "../../shared/ui/lazySurface";

const BoardView = lazySurface(async () => {
  const module = await import("../../features/task-board/ui/BoardView");
  return { default: module.BoardView };
});

type Props = {
  surface: LocalSurfaceId | null;
  besideRail: boolean;
  compactRail: boolean;
  projectPaths: readonly string[];
  onClose: () => void;
  onToggleSidebar: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenAutomation: (automationId: string) => void;
  taskBoard: TaskBoardRuntime;
};

export function LocalSurfaceViews({
  surface,
  besideRail,
  compactRail,
  projectPaths,
  onClose,
  onToggleSidebar,
  onOpenSession,
  onOpenAutomation,
  taskBoard,
}: Props): ReactNode {
  if (surface === "board") {
    return (
      <BoardView
        runtime={taskBoard}
        projects={projectPaths}
        besideRail={besideRail}
        compactRail={compactRail}
        onClose={onClose}
        onToggleSidebar={onToggleSidebar}
        onOpenSession={onOpenSession}
      />
    );
  }

  if (surface === "knowledge") {
    return (
      <KnowledgeView
        besideRail={besideRail}
        compactRail={compactRail}
        onClose={onClose}
        onToggleSidebar={onToggleSidebar}
      />
    );
  }

  if (surface === "home") {
    return (
      <HomeView
        besideRail={besideRail}
        compactRail={compactRail}
        projectPaths={projectPaths}
        onClose={onClose}
        onToggleSidebar={onToggleSidebar}
        onOpenSession={onOpenSession}
        onOpenAutomation={onOpenAutomation}
      />
    );
  }

  if (surface === "usage") {
    return (
      <UsageView
        besideRail={besideRail}
        compactRail={compactRail}
        onClose={onClose}
        onToggleSidebar={onToggleSidebar}
      />
    );
  }

  return null;
}
