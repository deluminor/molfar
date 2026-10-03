import { useCallback, type MouseEvent, type ReactNode } from "react";
import { projectName } from "../../../shared/lib/paths";
import type { RecentSessionRow } from "../model/recentSessions";
import { HomeCard } from "./HomeCard";

type Props = {
  sessions: RecentSessionRow[] | null;
  error: string | null;
  onOpenSession?: (sessionId: string) => void;
};

export function SessionsCard({
  sessions,
  error,
  onOpenSession,
}: Props): ReactNode {
  const onRowClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.id;
      if (!id || !onOpenSession) return;
      onOpenSession(id);
    },
    [onOpenSession],
  );

  if (error) {
    return (
      <HomeCard title="Sessions">
        <p className="font-mono text-[12px] text-content/45">{error}</p>
      </HomeCard>
    );
  }
  if (!sessions) {
    return (
      <HomeCard title="Sessions">
        <p className="font-mono text-[12px] text-content/40">Loading…</p>
      </HomeCard>
    );
  }
  if (sessions.length === 0) {
    return (
      <HomeCard title="Sessions">
        <p className="font-mono text-[12px] text-content/45">
          No recent sessions
        </p>
      </HomeCard>
    );
  }
  return (
    <HomeCard title="Sessions">
      <ul className="flex h-full flex-col justify-center gap-1">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              data-id={session.id}
              onClick={onRowClick}
              className="group flex w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] focus-visible:border-accent/40 focus-visible:outline-none"
            >
              <span
                aria-hidden
                className="h-6 w-0.5 shrink-0 rounded-full bg-accent/25 transition-colors group-hover:bg-accent"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-content/85 group-hover:text-content">
                {session.title}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-content/35 group-hover:text-accent/70">
                {projectName(session.cwd)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}
