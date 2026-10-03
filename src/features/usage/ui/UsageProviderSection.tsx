import type { ReactNode } from "react";
import { formatUsagePercent } from "../../providers/model/rate-limits";
import {
  usageBarTone,
  usageWindowFooter,
  type UsageCardState,
  type UsageProviderId,
  type UsageWindow,
} from "../model/usage-card";

const PROVIDER_TITLE: Record<UsageProviderId, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  antigravity: "Antigravity",
};

type Props = {
  provider: UsageProviderId;
  card: UsageCardState;
  now: number;
};

function toneClass(usedPercent: number): string {
  const tone = usageBarTone(usedPercent);
  if (tone === "critical") return "bg-[#f472b6]";
  if (tone === "mid") return "bg-content";
  return "bg-accent/70";
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
    <div className="flex flex-col gap-2 rounded-lg border border-stroke bg-content/[0.03] px-4 py-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-content">
            {window.label}
          </div>
          <div className="mt-1 text-[11px] text-content/40">
            {usageWindowFooter(window, now)}
          </div>
        </div>
        <div className="flex min-w-[40%] max-w-[55%] flex-1 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-content/10">
            <div
              className={`h-full rounded-full ${toneClass(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-[12px] tabular-nums text-content/55">
            {formatUsagePercent(pct)} used
          </span>
        </div>
      </div>
    </div>
  );
}

export function UsageProviderSection({
  provider,
  card,
  now,
}: Props): ReactNode {
  return (
    <section aria-label={PROVIDER_TITLE[provider]} className="flex flex-col gap-2">
      <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.16em] text-content/40">
        {PROVIDER_TITLE[provider]}
      </h2>
      {card.status === "loading" ? (
        <p className="px-1 text-[12px] text-content/40">Loading…</p>
      ) : null}
      {card.status === "unavailable" ? (
        <p className="rounded-lg border border-stroke px-4 py-3 text-[12px] text-content/45">
          {card.reason}
        </p>
      ) : null}
      {card.status === "error" || card.status === "ok" ? (
        card.windows.length > 0 ? (
          <div className="flex flex-col gap-2">
            {card.status === "error" ? (
              <p className="px-1 text-[11px] text-content/40">{card.reason}</p>
            ) : null}
            {card.windows.map((window) => (
              <WindowRow
                key={`${provider}-${window.kind}-${window.label}`}
                window={window}
                now={now}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-stroke px-4 py-3 text-[12px] text-content/45">
            {card.status === "error" ? card.reason : "No usage windows"}
          </p>
        )
      ) : null}
    </section>
  );
}
