import type { ReactNode } from "react";
import { formatNextDueAt, type HomeStatus } from "../model/home-status";
import { HomeCard } from "./HomeCard";

type Props = {
  status: HomeStatus | null;
  error: string | null;
};

type Metric = {
  label: string;
  value: string;
  active?: boolean;
};

function MetricRow({ label, value, active }: Metric): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-content/40">
        {label}
      </span>
      <span
        className={`font-mono text-[13px] tabular-nums tracking-tight ${
          active ? "text-accent" : "text-content/70"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPanel({ status }: { status: HomeStatus }): ReactNode {
  const live =
    status.recentSessionCount > 0 || status.enabledAutomationCount > 0;
  const metrics: Metric[] = [
    {
      label: "Sessions 24h",
      value: String(status.recentSessionCount),
      active: status.recentSessionCount > 0,
    },
    {
      label: "Automations",
      value: String(status.enabledAutomationCount),
      active: status.enabledAutomationCount > 0,
    },
    {
      label: "Next due",
      value: formatNextDueAt(status.nextDueAt),
    },
  ];

  return (
    <div
      className="flex h-full flex-col justify-between gap-3"
      aria-label={`System ${live ? "online" : "idle"}; sessions ${status.recentSessionCount}; automations ${status.enabledAutomationCount}; next due ${formatNextDueAt(status.nextDueAt)}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${
            live
              ? "bg-accent shadow-[0_0_6px_var(--color-accent)]"
              : "bg-content/25"
          }`}
        />
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.22em] ${
            live ? "text-accent" : "text-content/45"
          }`}
        >
          {live ? "Online" : "Idle"}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {metrics.map((metric) => (
          <MetricRow key={metric.label} {...metric} />
        ))}
      </div>
    </div>
  );
}

export function StatusCard({ status, error }: Props): ReactNode {
  if (error) {
    return (
      <HomeCard title="Status">
        <p className="font-mono text-[12px] text-content/45">{error}</p>
      </HomeCard>
    );
  }
  if (!status) {
    return (
      <HomeCard title="Status">
        <p className="font-mono text-[12px] text-content/40">Loading…</p>
      </HomeCard>
    );
  }
  return (
    <HomeCard title="Status">
      <StatusPanel status={status} />
    </HomeCard>
  );
}
