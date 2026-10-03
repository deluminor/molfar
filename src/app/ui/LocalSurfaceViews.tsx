import type { ReactNode } from "react";
import { HomeView } from "../../features/home/ui/HomeView";
import type { LocalSurfaceId } from "../../features/home/ui/LocalSurfaceRailActions";
import { KnowledgeView } from "../../features/knowledge/ui/KnowledgeView";
import { UsageView } from "../../features/usage/ui/UsageView";

type Props = {
  surface: LocalSurfaceId | null;
  besideRail: boolean;
  compactRail: boolean;
  projectPaths: readonly string[];
  onClose: () => void;
  onToggleSidebar: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenAutomation: (automationId: string) => void;
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
}: Props): ReactNode {
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
