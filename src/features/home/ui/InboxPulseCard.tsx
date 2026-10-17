import type { ReactNode } from "react";
import type { InboxPulseState } from "../hooks/useInboxPulse";
import { HomeCard } from "./HomeCard";

type Props = {
  state: InboxPulseState;
  onOpenInbox?: () => void;
};

function Message({ children }: { children: ReactNode }): ReactNode {
  return (
    <HomeCard title="Inbox">
      <p className="font-mono text-[12px] text-content/45">{children}</p>
    </HomeCard>
  );
}

export function InboxPulseCard({ state, onOpenInbox }: Props): ReactNode {
  if (state.status === "loading") return <Message>Loading…</Message>;
  if (state.status === "unavailable")
    return <Message>Inbox unavailable</Message>;

  const { attentionCount, rows } = state.pulse;
  if (rows.length === 0) return <Message>Inbox clear</Message>;

  return (
    <HomeCard
      title="Inbox"
      actions={
        attentionCount > 0 ? (
          <span className="shrink-0 tabular-nums text-accent">
            {attentionCount} new
          </span>
        ) : null
      }
    >
      <ul className="flex h-full flex-col justify-start gap-0.5 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={onOpenInbox}
              className="group flex w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] focus-visible:border-accent/40 focus-visible:outline-none"
            >
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${
                  row.unseen ? "bg-accent" : "bg-content/20"
                }`}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-tight text-content/85 group-hover:text-content">
                {row.title}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-content/35 group-hover:text-accent/70">
                {row.meta}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}
