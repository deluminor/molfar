import { useCallback, type MouseEvent, type ReactNode } from "react";
import {
  formatAutomationRunAt,
  type RecentAutomationRow,
} from "../model/recent-automations";
import { HomeCard } from "./HomeCard";

type Props = {
  automations: RecentAutomationRow[] | null;
  error: string | null;
  onOpenAutomation?: (automationId: string) => void;
};

function automationMeta(automation: RecentAutomationRow): string {
  if (!automation.enabled) return "paused";
  return (
    automation.lastRunStatus ?? formatAutomationRunAt(automation.nextRunAt)
  );
}

export function AutomationsCard({
  automations,
  error,
  onOpenAutomation,
}: Props): ReactNode {
  const onRowClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.id;
      if (!id || !onOpenAutomation) return;
      onOpenAutomation(id);
    },
    [onOpenAutomation],
  );

  if (error) {
    return (
      <HomeCard title="Automations">
        <p className="font-mono text-[12px] text-content/45">{error}</p>
      </HomeCard>
    );
  }
  if (!automations) {
    return (
      <HomeCard title="Automations">
        <p className="font-mono text-[12px] text-content/40">Loading…</p>
      </HomeCard>
    );
  }
  if (automations.length === 0) {
    return (
      <HomeCard title="Automations">
        <p className="font-mono text-[12px] text-content/45">No automations</p>
      </HomeCard>
    );
  }
  return (
    <HomeCard title="Automations">
      <ul className="flex h-full flex-col justify-center align-top gap-1">
        {automations.map((automation) => (
          <li key={automation.id}>
            <button
              type="button"
              data-id={automation.id}
              onClick={onRowClick}
              className="group flex w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] focus-visible:border-accent/40 focus-visible:outline-none"
            >
              <span
                aria-hidden
                className={`h-6 w-0.5 shrink-0 rounded-full transition-colors ${
                  automation.enabled
                    ? "bg-accent/40 group-hover:bg-accent"
                    : "bg-content/20 group-hover:bg-content/40"
                }`}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-content/85 group-hover:text-content">
                {automation.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-content/35 group-hover:text-accent/70">
                {automationMeta(automation)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}
