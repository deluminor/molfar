import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Gauge, RefreshCw } from "../../../shared/ui/icons";
import { SurfaceHeader } from "../../home/ui/SurfaceHeader";
import { refreshUsageCards } from "../model/fetchUsage";
import {
  usageBarTone,
  usageWindowFooter,
  type UsageCardState,
  type UsageProviderId,
  type UsageWindow,
} from "../model/usageCard";

const PROVIDERS: { id: UsageProviderId; title: string }[] = [
  { id: "codex", title: "Codex" },
  { id: "cursor", title: "Cursor" },
  { id: "claude", title: "Claude" },
  { id: "antigravity", title: "Antigravity" },
];

const BAR_TONE: Record<ReturnType<typeof usageBarTone>, string> = {
  low: "bg-accent/70",
  mid: "bg-content/80",
  critical: "bg-rose-400",
};

type Props = {
  besideRail?: boolean;
  compactRail?: boolean;
  onClose: () => void;
  onToggleSidebar?: () => void;
};

function UsageBar({
  window,
  now,
}: {
  window: UsageWindow;
  now: number;
}): ReactNode {
  const pct = Math.min(100, Math.max(0, window.usedPercent));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium text-content">
            {window.label}
          </div>
          <div className="truncate text-[11px] text-content/40">
            {usageWindowFooter(window, now)}
          </div>
        </div>
        <span className="shrink-0 text-[12px] tabular-nums text-content/55">
          {Math.round(pct)}% used
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-content/10">
        <div
          className={`h-full rounded-full ${BAR_TONE[usageBarTone(pct)]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ProviderCard({
  title,
  state,
  now,
}: {
  title: string;
  state: UsageCardState;
  now: number;
}): ReactNode {
  return (
    <section className="rounded-xl border border-stroke bg-content/[0.03] p-4">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-content/40">
        {title}
      </h2>
      {state.status === "loading" ? (
        <p className="text-[13px] text-content/40">Loading…</p>
      ) : null}
      {state.status === "unavailable" ? (
        <p className="text-[13px] text-content/45">{state.reason}</p>
      ) : null}
      {state.status === "error" && state.windows.length === 0 ? (
        <p className="text-[13px] text-content/45">{state.reason}</p>
      ) : null}
      {state.status === "ok" ||
      (state.status === "error" && state.windows.length > 0) ? (
        <div className="flex flex-col gap-4">
          {state.windows.map((window) => (
            <UsageBar key={window.kind} window={window} now={now} />
          ))}
          {state.status === "error" ? (
            <p className="text-[11px] text-content/40">{state.reason}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Provider limits surface opened from the project rail. */
export function UsageView({
  besideRail = false,
  compactRail = false,
  onClose,
  onToggleSidebar,
}: Props): ReactNode {
  const [cards, setCards] = useState(
    () => new Map<UsageProviderId, UsageCardState>(),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await refreshUsageCards(cardsRef.current);
      setCards(next);
      setNow(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void refreshUsageCards(new Map()).then((next) => {
      if (alive) {
        setCards(next);
        setNow(Date.now());
      }
    });
    return () => {
      alive = false;
    };
  }, []);

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
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
          {PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider.id}
              title={provider.title}
              state={cards.get(provider.id) ?? { status: "loading" }}
              now={now}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
