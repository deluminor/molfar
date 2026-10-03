import type { ReactNode } from "react";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { Home } from "../../../shared/ui/icons";
import { useHomeDashboard } from "../hooks/useHomeDashboard";
import {
  useHomeLayoutEditing,
  type HomeLayoutEditing,
} from "../hooks/useHomeLayoutEditing";
import { useHostStats } from "../hooks/useHostStats";
import { AutomationsCard } from "./AutomationsCard";
import { ClockCard } from "./ClockCard";
import { BrandCard } from "./BrandCard";
import { HomeCard } from "./HomeCard";
import { HomeGrid } from "./HomeGrid";
import { HostCard } from "./HostCard";
import { MatrixRain } from "./MatrixRain";
import { SessionsCard } from "./SessionsCard";
import { StatusCard } from "./StatusCard";
import { SurfaceHeader } from "./SurfaceHeader";

type Props = {
  besideRail?: boolean;
  compactRail?: boolean;
  projectPaths?: readonly string[];
  onClose: () => void;
  onToggleSidebar?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onOpenAutomation?: (automationId: string) => void;
};

const NO_PROJECTS: readonly string[] = [];

function LayoutActions({
  editing,
  canEditLayout,
  onStartEdit,
  onDoneEdit,
  onResetLayout,
}: HomeLayoutEditing): ReactNode {
  if (editing) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 px-2">
        <SecondaryButton onClick={onResetLayout}>Reset</SecondaryButton>
        <SecondaryButton onClick={onDoneEdit}>Done</SecondaryButton>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 px-2">
      <SecondaryButton
        disabled={!canEditLayout}
        onClick={onStartEdit}
        title={
          canEditLayout
            ? "Rearrange Home widgets"
            : "Widen the window to edit the layout"
        }
      >
        Edit layout
      </SecondaryButton>
    </div>
  );
}

/** Personal dashboard surface opened from the project rail. */
export function HomeView({
  besideRail = false,
  compactRail = false,
  projectPaths = NO_PROJECTS,
  onClose,
  onToggleSidebar,
  onOpenSession,
  onOpenAutomation,
}: Props): ReactNode {
  const host = useHostStats();
  const dashboard = useHomeDashboard(projectPaths);
  const layoutEditing = useHomeLayoutEditing();

  return (
    <div
      role="region"
      aria-label="Home"
      data-app-home
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <SurfaceHeader
        title="Home"
        icon={Home}
        besideRail={besideRail}
        compactRail={compactRail}
        onClose={onClose}
        onToggleSidebar={onToggleSidebar}
        actions={<LayoutActions {...layoutEditing} />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <HomeGrid
          layout={layoutEditing.layout}
          isEditing={layoutEditing.editing}
          onLayoutChange={layoutEditing.onLayoutChange}
          onLayoutCommit={layoutEditing.onLayoutCommit}
          clock={<ClockCard />}
          status={
            <StatusCard status={dashboard.status} error={dashboard.error} />
          }
          brand={<BrandCard />}
          host={
            <HostCard
              stats={host.host}
              history={host.history}
              error={host.error}
            />
          }
          sessions={
            <SessionsCard
              sessions={dashboard.sessions}
              error={dashboard.error}
              onOpenSession={onOpenSession}
            />
          }
          automations={
            <AutomationsCard
              automations={dashboard.automations}
              error={dashboard.error}
              onOpenAutomation={onOpenAutomation}
            />
          }
          matrix={
            <HomeCard
              title="Matrix"
              className="p-0 [&>header]:px-3 [&>header]:pt-3"
            >
              <MatrixRain />
            </HomeCard>
          }
        />
      </div>
    </div>
  );
}
