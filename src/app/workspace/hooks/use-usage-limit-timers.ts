import { useEffect, useRef, useState } from "react";
import { exhaustedWindowResetAt } from "@/domain/rate-limits/rate-limit-window";
import type { UsageLimit } from "@/domain/session/message-queue";
import type { Session } from "@/domain/session/session";
import {
  fetchClaudeRateLimits,
  fetchCodexRateLimits,
} from "@/features/providers/model/rate-limits-fetch";
import {
  USAGE_LIMIT_RESUME_GRACE_MS,
  usageLimitResumeDue,
} from "@/features/sessions/model/usage-limit";
import { mapSession, type TurnQueueDeps } from "../flows/turn-queue/turn-queue-deps";

/** Resumes sessions whose usage limit has reset, when the user asked to. */
function useResumeAtReset(
  sessions: Session[],
  openSessions: () => Session[],
  resume: (sessionId: string) => void,
): void {
  const resumingRef = useRef(new Set<string>());
  const [tick, setTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick re-checks limits after a wait
  useEffect(() => {
    const resuming = resumingRef.current;
    const now = Date.now();
    const timers: number[] = [];
    const scheduled = new Set<string>();
    let nextCheck = Number.POSITIVE_INFINITY;

    for (const session of sessions) {
      const limit = session.usageLimit;
      if (!limit?.resumeAtReset || limit.resetsAt == null) continue;
      if (!usageLimitResumeDue(session, now)) {
        nextCheck = Math.min(nextCheck, limit.resetsAt + USAGE_LIMIT_RESUME_GRACE_MS - now);
        continue;
      }
      if (resuming.has(session.id)) continue;

      resuming.add(session.id);
      scheduled.add(session.id);
      timers.push(
        window.setTimeout(() => {
          resuming.delete(session.id);
          const latest = openSessions().find((entry) => entry.id === session.id);
          if (latest && usageLimitResumeDue(latest, Date.now())) resume(session.id);
        }, 0),
      );
    }

    if (Number.isFinite(nextCheck)) {
      // Re-check every minute at most: timers drift while the machine sleeps.
      timers.push(
        window.setTimeout(
          () => setTick((value) => value + 1),
          Math.max(1_000, Math.min(nextCheck, 60_000)),
        ),
      );
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const id of scheduled) resuming.delete(id);
    };
  }, [openSessions, resume, sessions, tick]);
}

/** The stream does not always say when the limit resets; asks the provider. */
function useUsageLimitResetLookup(
  sessions: Session[],
  updateSessions: TurnQueueDeps["updateSessions"],
): void {
  const lookupsRef = useRef(new WeakSet<UsageLimit>());

  useEffect(() => {
    for (const session of sessions) {
      const limit = session.usageLimit;
      if (!limit || limit.resetsAt != null || lookupsRef.current.has(limit)) continue;

      let fetchLimits: typeof fetchClaudeRateLimits | undefined;
      if (session.harness === "claude") fetchLimits = fetchClaudeRateLimits;
      if (session.harness === "codex") fetchLimits = fetchCodexRateLimits;
      if (!fetchLimits) continue;

      lookupsRef.current.add(limit);
      void fetchLimits(session.providerAccountId).then((limits) => {
        const resetsAt = exhaustedWindowResetAt(limits);
        if (resetsAt == null) return;
        updateSessions(
          mapSession(session.id, (entry) =>
            entry.usageLimit === limit ? { ...entry, usageLimit: { ...limit, resetsAt } } : entry,
          ),
        );
      });
    }
  }, [sessions, updateSessions]);
}

export function useUsageLimitTimers(
  sessions: Session[],
  deps: Pick<TurnQueueDeps, "sessions" | "updateSessions">,
  resume: (sessionId: string) => void,
): void {
  useResumeAtReset(sessions, deps.sessions, resume);
  useUsageLimitResetLookup(sessions, deps.updateSessions);
}
