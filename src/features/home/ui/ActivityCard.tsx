import type { ReactNode } from "react";
import type { SessionActivityState } from "../hooks/useSessionActivity";
import { HomeCard } from "./HomeCard";
import { YearHeatmap } from "./YearHeatmap";

type Props = {
  state: SessionActivityState;
};

export function ActivityCard({ state }: Props): ReactNode {
  if (state.status === "loading") {
    return (
      <HomeCard title="Activity">
        <p className="font-mono text-[12px] text-content/40">Loading…</p>
      </HomeCard>
    );
  }

  if (state.status === "error") {
    return (
      <HomeCard title="Activity">
        <p className="font-mono text-[12px] text-content/45">{state.message}</p>
      </HomeCard>
    );
  }

  return (
    <HomeCard title="Activity">
      <div className="flex h-full min-h-0 items-center">
        <YearHeatmap grid={state.grid} variant="compact" />
      </div>
    </HomeCard>
  );
}
