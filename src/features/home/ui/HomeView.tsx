import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { Home } from "../../../shared/ui/icons";
import { loadHomeDashboard } from "../model/homeData";
import {
  HOME_LAYOUT_EDIT_MIN_WIDTH_PX,
  NARROW_HOME_LAYOUT,
  loadHomeLayout,
  resetHomeLayout,
  saveHomeLayout,
  type HomeLayout,
} from "../model/homeLayout";
import type { HomeStatus } from "../model/homeStatus";
import { pushHostSample, type HostSamplePoint } from "../model/hostHistory";
import { fetchHostStats, type HostStats } from "../model/hostStats";
import type { RecentAutomationRow } from "../model/recentAutomations";
import type { RecentSessionRow } from "../model/recentSessions";
import { AutomationsCard } from "./AutomationsCard";
import { ClockCard } from "./ClockCard";
import { DragonCard } from "./DragonCard";
import { HomeCard } from "./HomeCard";
import { HomeGrid } from "./HomeGrid";
import { HostCard } from "./HostCard";
import { MatrixRain } from "./MatrixRain";
import { SessionsCard } from "./SessionsCard";
import { StatusCard } from "./StatusCard";
import { SurfaceHeader } from "./SurfaceHeader";

const HOST_POLL_MS = 2_000;

type Props = {
  besideRail?: boolean;
  compactRail?: boolean;
  projectPaths?: readonly string[];
  onClose: () => void;
  onToggleSidebar?: () => void;
  onOpenSession?: (sessionId: string) => void;
  onOpenAutomation?: (automationId: string) => void;
};

/** Personal dashboard surface opened from the project rail. */
export function HomeView({
  besideRail = false,
  compactRail = false,
  projectPaths = [],
  onClose,
  onToggleSidebar,
  onOpenSession,
  onOpenAutomation,
}: Props): ReactNode {
  const [host, setHost] = useState<HostStats | null>(null);
  const [hostHistory, setHostHistory] = useState<HostSamplePoint[]>([]);
  const [hostError, setHostError] = useState<string | null>(null);
  const [status, setStatus] = useState<HomeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<RecentSessionRow[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [automations, setAutomations] = useState<RecentAutomationRow[] | null>(
    null,
  );
  const [automationsError, setAutomationsError] = useState<string | null>(null);
  const [wideLayout, setWideLayout] = useState<HomeLayout>(() => loadHomeLayout());
  const [isEditing, setIsEditing] = useState(false);
  const [canEditLayout, setCanEditLayout] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(
          `(min-width: ${HOME_LAYOUT_EDIT_MIN_WIDTH_PX}px)`,
        ).matches
      : true,
  );

  useEffect(() => {
    const media = window.matchMedia(
      `(min-width: ${HOME_LAYOUT_EDIT_MIN_WIDTH_PX}px)`,
    );
    const sync = (): void => {
      setCanEditLayout(media.matches);
      if (!media.matches) setIsEditing(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const layout = canEditLayout ? wideLayout : NARROW_HOME_LAYOUT;
  const editing = isEditing && canEditLayout;

  const onLayoutChange = useCallback((next: HomeLayout): void => {
    setWideLayout(next);
  }, []);

  const onLayoutCommit = useCallback((next: HomeLayout): void => {
    setWideLayout(next);
    saveHomeLayout(next);
  }, []);

  const onStartEdit = useCallback((): void => {
    if (!canEditLayout) return;
    setIsEditing(true);
  }, [canEditLayout]);

  const onDoneEdit = useCallback((): void => {
    setIsEditing(false);
  }, []);

  const onResetLayout = useCallback((): void => {
    setWideLayout(resetHomeLayout());
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (): void => {
      clearTimer();
      timer = setTimeout(tick, HOST_POLL_MS);
    };

    const tick = (): void => {
      if (!alive || document.hidden) return;
      void fetchHostStats()
        .then((next) => {
          if (!alive) return;
          setHost(next);
          setHostHistory((history) => pushHostSample(history, next));
          setHostError(null);
        })
        .catch((error: unknown) => {
          if (!alive) return;
          setHostError(
            error instanceof Error ? error.message : "Host stats unavailable",
          );
        })
        .finally(() => {
          if (alive && !document.hidden) schedule();
        });
    };

    const onVisibility = (): void => {
      if (document.hidden) {
        clearTimer();
        return;
      }
      clearTimer();
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void loadHomeDashboard(projectPaths)
      .then((data) => {
        if (!alive) return;
        setStatus(data.status);
        setStatusError(null);
        setSessions(data.sessions);
        setSessionsError(null);
        setAutomations(data.automations);
        setAutomationsError(null);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const reason =
          error instanceof Error ? error.message : "Home data unavailable";
        setStatusError(reason);
        setSessionsError(reason);
        setAutomationsError(reason);
        setSessions([]);
        setAutomations([]);
      });
    return () => {
      alive = false;
    };
  }, [projectPaths]);

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
        actions={
          <div className="flex shrink-0 items-center gap-1.5 px-2">
            {editing ? (
              <>
                <SecondaryButton onClick={onResetLayout}>Reset</SecondaryButton>
                <SecondaryButton onClick={onDoneEdit}>Done</SecondaryButton>
              </>
            ) : (
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
            )}
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <HomeGrid
          layout={layout}
          isEditing={editing}
          onLayoutChange={onLayoutChange}
          onLayoutCommit={onLayoutCommit}
          clock={<ClockCard />}
          status={<StatusCard status={status} error={statusError} />}
          brand={<DragonCard />}
          host={
            <HostCard
              stats={host}
              history={hostHistory}
              error={hostError}
            />
          }
          sessions={
            <SessionsCard
              sessions={sessions}
              error={sessionsError}
              onOpenSession={onOpenSession}
            />
          }
          automations={
            <AutomationsCard
              automations={automations}
              error={automationsError}
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
