import type { ReactNode } from "react";
import {
  usageBarTone,
  usageWindowFooter,
  type UsageCardState,
  type UsageWindow,
} from "../model/usage-card";

const BAR_TONE: Record<ReturnType<typeof usageBarTone>, string> = {
  low: "bg-accent/70",
  mid: "bg-content/80",
  critical: "bg-rose-400",
};

type Props = {
  title: string;
  state: UsageCardState;
  now: number;
};

function StatusLine({ text }: { text: string }): ReactNode {
  return <p className="font-mono text-[12px] text-content/45">{text}</p>;
}

function WindowRow({
  window,
  now,
}: {
  window: UsageWindow;
  now: number;
}): ReactNode {
  const pct = Math.min(100, Math.max(0, window.usedPercent));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] text-content/80">
            {window.label}
          </div>
          <div className="truncate font-mono text-[10px] text-content/35">
            {usageWindowFooter(window, now)}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-content/70">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-content/10">
        <div
          className={`h-full rounded-full ${BAR_TONE[usageBarTone(pct)]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Dense provider card — limits when known, status otherwise, never fake %. */
export function UsageProviderCard({ title, state, now }: Props): ReactNode {
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-lg border border-stroke bg-content/[0.025] p-3">
      <header>
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent/70">
          {title}
        </h2>
      </header>

      {state.status === "loading" ? <StatusLine text="Loading…" /> : null}
      {state.status === "unavailable" ? (
        <StatusLine text={state.reason} />
      ) : null}
      {state.status === "error" && state.windows.length === 0 ? (
        <StatusLine text={state.reason} />
      ) : null}
      {state.status === "ok" ||
      (state.status === "error" && state.windows.length > 0) ? (
        <div className="flex flex-col gap-3">
          {state.windows.map((window) => (
            <WindowRow key={window.kind} window={window} now={now} />
          ))}
          {state.status === "error" ? (
            <p className="font-mono text-[10px] text-content/40">{state.reason}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
