import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Gauge, RefreshCw } from "../../../shared/ui/icons";
import { useSessionActivity } from "../../home/hooks/useSessionActivity";
import { SurfaceHeader } from "../../home/ui/SurfaceHeader";
import { YearHeatmap } from "../../home/ui/YearHeatmap";
import { refreshUsageCards } from "../model/fetchUsage";
import {
  listedUsageProviders,
  usageProviderTitle,
} from "../model/usageProviders";
import {
  loadUsageSnapshots,
  recordUsageSnapshots,
  usageTrendSeries,
  type UsageDaySnapshot,
} from "../model/usageSnapshots";
import type { UsageCardState, UsageProviderId } from "../model/usageCard";
import { UsageProviderCard } from "./UsageProviderCard";
import { UsageTrendChart } from "./UsageTrendChart";

type Props = {
  besideRail?: boolean;
  compactRail?: boolean;
  projectPaths?: readonly string[];
  onClose: () => void;
  onToggleSidebar?: () => void;
};

const NO_PROJECTS: readonly string[] = [];

/** Provider limits surface opened from the project rail. */
export function UsageView({
  besideRail = false,
  compactRail = false,
  projectPaths = NO_PROJECTS,
  onClose,
  onToggleSidebar,
}: Props): ReactNode {
  const [cards, setCards] = useState(
    () => new Map<UsageProviderId, UsageCardState>(),
  );
  const [snapshots, setSnapshots] = useState<UsageDaySnapshot[]>(() =>
    loadUsageSnapshots(),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const activity = useSessionActivity(projectPaths, true);

  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const applyCards = useCallback((next: Map<UsageProviderId, UsageCardState>) => {
    setCards(next);
    setSnapshots(recordUsageSnapshots(next));
    setNow(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      applyCards(await refreshUsageCards(cardsRef.current));
    } finally {
      setRefreshing(false);
    }
  }, [applyCards]);

  useEffect(() => {
    let alive = true;
    void refreshUsageCards(new Map()).then((next) => {
      if (alive) applyCards(next);
    });
    return () => {
      alive = false;
    };
  }, [applyCards]);

  const trend = usageTrendSeries(snapshots);

  return (
    <div
      role="region"
      aria-label="Usage"
      data-app-usage
      className="flex min-h-0 min-w-0 flex-1 flex-col text-content"
    >
      <SurfaceHeader
        title="Usage"
        icon={Gauge}
        besideRail={besideRail}
        compactRail={compactRail}
        onClose={onClose}
        onToggleSidebar={onToggleSidebar}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Refresh usage"
            className="mr-2 grid size-7 place-items-center rounded-md text-content/50 hover:bg-content/10 hover:text-content disabled:opacity-40"
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <section className="rounded-lg border border-stroke bg-content/[0.025] p-3">
            <UsageTrendChart points={trend} />
          </section>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {listedUsageProviders(cards).map((provider) => (
              <UsageProviderCard
                key={provider}
                title={usageProviderTitle(provider)}
                state={cards.get(provider) ?? { status: "loading" }}
                now={now}
              />
            ))}
          </div>

          <section className="rounded-lg border border-stroke bg-content/[0.025] p-3">
            <h2 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent/70">
              Activity
            </h2>
            {activity.status === "ready" ? (
              <YearHeatmap grid={activity.grid} variant="full" />
            ) : activity.status === "error" ? (
              <p className="font-mono text-[12px] text-content/45">
                {activity.message}
              </p>
            ) : (
              <p className="font-mono text-[12px] text-content/40">Loading…</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
