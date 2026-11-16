import { useEffect } from "react";
import type { Session } from "@/domain/session/session";
import { type OrchestrationRun, orchestrator } from "@/features/orchestration/model/orchestration";
import {
  attachOrchestrationWorkers,
  consolidateOrchestrationTabs,
} from "@/features/orchestration/model/orchestration-workspace";
import type { WorkspaceTab } from "@/features/workspace/model/layout";

export type OrchestrationSyncDeps = {
  setSessions(update: (previous: Session[]) => Session[]): void;
  setTabs(tabs: WorkspaceTab[]): void;
  setActiveTabId(tabId: string): void;
};

/** Keeps workers tied to their lead, folds worker tabs into an open lead and lets the orchestrator see session changes. */
export function useOrchestrationSync(
  runs: OrchestrationRun[],
  sessions: Session[],
  tabs: WorkspaceTab[],
  activeTabId: string,
  deps: OrchestrationSyncDeps,
): void {
  useEffect(() => {
    deps.setSessions((previous) => attachOrchestrationWorkers(previous, runs));
  }, [deps, runs]);

  useEffect(() => {
    const next = consolidateOrchestrationTabs(tabs, activeTabId, runs);
    if (next.tabs !== tabs) deps.setTabs(next.tabs);
    if (next.activeTabId !== activeTabId) deps.setActiveTabId(next.activeTabId);
  }, [deps, tabs, activeTabId, runs]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the orchestrator re-reads sessions on every change.
  useEffect(() => {
    orchestrator.sync();
  }, [sessions]);
}
