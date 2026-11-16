import {
  canTabVisitBack,
  canTabVisitForward,
  emptyTabVisitHistory,
  pruneTabVisitHistory,
  recordTabVisit,
  tabVisitBack,
  tabVisitForward,
  type TabVisitHistory,
} from "@/features/workspace/model/tab-visit-history";
import type { WorkspaceStore } from "../../store/types";

export type TabVisits = {
  /** Records the active tab after a change; a step through history is not a new visit. */
  sync(openTabIds: ReadonlySet<string>, activeTabId: string): void;
  /** The tab Back or Forward lands on, or null when there is none. */
  step(
    direction: "back" | "forward",
    openTabIds: ReadonlySet<string>,
    activeTabId: string,
  ): string | null;
};

/** Browser-style Back / Forward over workspace tabs, published to the store. */
export function createTabVisits(
  store: WorkspaceStore,
  initialTabId: string,
): TabVisits {
  let history = emptyTabVisitHistory(initialTabId);
  let steppingThroughHistory = false;

  const commit = (next: TabVisitHistory) => {
    history = next;
    const canBack = canTabVisitBack(next);
    const canForward = canTabVisitForward(next);
    store
      .getState()
      .setTabVisitNav((previous) =>
        previous.canBack === canBack && previous.canForward === canForward
          ? previous
          : { canBack, canForward },
      );
  };

  return {
    sync(openTabIds, activeTabId) {
      let next = pruneTabVisitHistory(history, openTabIds, activeTabId);
      if (steppingThroughHistory) {
        steppingThroughHistory = false;
      } else if (next.current !== activeTabId) {
        next = recordTabVisit(next, activeTabId);
      }
      commit(pruneTabVisitHistory(next, openTabIds, activeTabId));
    },
    step(direction, openTabIds, activeTabId) {
      const pruned = pruneTabVisitHistory(history, openTabIds, activeTabId);
      const next =
        direction === "back" ? tabVisitBack(pruned) : tabVisitForward(pruned);
      if (!next || !openTabIds.has(next.current)) return null;

      steppingThroughHistory = true;
      commit(next);
      return next.current;
    },
  };
}
