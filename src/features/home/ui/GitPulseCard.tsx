import type { ReactNode } from "react";
import { projectName } from "../../../shared/lib/paths";
import type { GitPulseState } from "../hooks/useGitPulse";
import { HomeCard } from "./HomeCard";

type Props = {
  cwd: string;
  state: GitPulseState;
};

function Row({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-content/40">
        {label}
      </span>
      <span
        className={`min-w-0 truncate font-mono text-[12px] tabular-nums ${
          active ? "text-accent" : "text-content/70"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function GitPulseCard({ cwd, state }: Props): ReactNode {
  if (state.status !== "ready") {
    return (
      <HomeCard title="Git">
        <p className="font-mono text-[12px] text-content/45">
          {state.status === "loading"
            ? "Loading…"
            : cwd
              ? "No git repository"
              : "No project selected"}
        </p>
      </HomeCard>
    );
  }

  const { pulse } = state;
  return (
    <HomeCard
      title="Git"
      actions={
        <span className="min-w-0 truncate normal-case tracking-normal text-content/40">
          {projectName(cwd)}
        </span>
      }
    >
      <div className="flex h-full flex-col justify-center gap-2">
        <Row label="Branch" value={pulse.branch} />
        <Row
          label="Tree"
          value={pulse.dirty ? `${pulse.changedCount} changed` : "clean"}
          active={pulse.dirty}
        />
        <Row
          label="Sync"
          value={
            pulse.tracking ? `↑${pulse.ahead} ↓${pulse.behind}` : "no upstream"
          }
          active={pulse.tracking && pulse.ahead + pulse.behind > 0}
        />
        {pulse.subject ? (
          <p className="truncate font-mono text-[11px] text-content/45">
            {pulse.subject}
          </p>
        ) : null}
      </div>
    </HomeCard>
  );
}
