import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { StateUpdate } from "./state-update";

export type TabVisitNav = { canBack: boolean; canForward: boolean };

export type TabsState = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  /** Whether Back / Forward have a tab to visit. */
  tabVisitNav: TabVisitNav;
};

export type TabsActions = {
  setTabs: (update: StateUpdate<WorkspaceTab[]>) => void;
  setActiveTabId: (update: StateUpdate<string>) => void;
  setTabVisitNav: (update: StateUpdate<TabVisitNav>) => void;
};
