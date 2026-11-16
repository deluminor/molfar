import { useEffect } from "react";
import type { Session } from "@/domain/session/session";
import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";
import { workerDetailOpener } from "../flows/orchestration-workers/worker-detail-tabs";
import type { WorkerDetailRequest } from "../store/surfaces-slice";
import type { WorkspaceStore } from "../store/types";

export type WorkerDetailPaneDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  projectCwd(): string;
  selectTab(tabId: string): void;
  setComposerFocused(focused: boolean): void;
};

/** Opens a requested run's workers beside their lead once the lead's tab is there. */
export function useWorkerDetailPanes(
  tabs: WorkspaceTab[],
  request: WorkerDetailRequest | null,
  deps: WorkerDetailPaneDeps,
): void {
  useEffect(() => {
    if (!request) return;
    const { setWorkerDetailRequest, setTabs } = deps.store.getState();
    const { leadId } = request;
    const tab = tabs.find((entry) => leafIds(entry.layout).includes(leadId));
    if (!tab) {
      // Still opening: this runs again on the commit that lands the lead. If
      // the lead never arrived at all, drop the request rather than let it
      // fire against some later tab change.
      if (!deps.sessionsRef.current.some((entry) => entry.id === leadId)) setWorkerDetailRequest(null);
      return;
    }

    setWorkerDetailRequest(null);
    const cwd = deps.sessionsRef.current.find((entry) => entry.id === leadId)?.cwd ?? deps.projectCwd();
    const openWorkers = workerDetailOpener(request, cwd);
    setTabs((prev) => prev.map((entry) => (entry.id === tab.id ? openWorkers(entry) : entry)));
    deps.selectTab(tab.id);
    deps.setComposerFocused(false);
  }, [tabs, request, deps]);
}
