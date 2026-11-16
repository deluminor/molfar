import type { Dispatch, SetStateAction } from "react";
import type { AppView } from "@/features/workspace/model/app-view-tabs";
import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
import type { WorkspaceStore } from "../store/types";

/** The title bar as last rendered: its tabs, the shown one, and how to select one. */
export type DisplayedTabNavigation = {
  tabs: readonly TitleTab[];
  activeId: string;
  select?: (id: string) => void;
};

/** What the inset layout's shortcuts see as the shown tab. */
export type VisibleTabs = {
  insetLayout: boolean;
  /** The Familiar's tab while it covers the workspace. */
  familiarTabId?: string;
  activeAppView?: AppView;
  activeTabId: string;
  titleTabs: readonly TitleTab[];
};

export type DisplayedTabsDeps = {
  store: WorkspaceStore;
  navigation: { readonly current: DisplayedTabNavigation };
  visible(): VisibleTabs;
  activeTabIdRef: { readonly current: string };
  setOpenAppViews: Dispatch<SetStateAction<AppView[]>>;
  setOpenFamiliarTabs: Dispatch<SetStateAction<string[]>>;
  setTitleTabOrder: Dispatch<SetStateAction<string[]>>;
  setAutomationsViewOpen(open: boolean): void;
  openFamiliar(familiarId: string): unknown;
  openAppView(view: AppView): void;
  activateTab(tabId: string): void;
  closeFamiliarView(): void;
  /** Workspace tab actions, as the classic layout runs them. */
  workspace: {
    closeTitleTab(tabId: string): void;
    closeTabs(ids: string[], fallbackId: string): void;
    closeEveryTab(ids: readonly string[]): void;
    reorderTabs(ids: string[], movedId?: string): void;
    closeFocused(): void;
    next(): void;
    prev(): void;
    activate(slot: number): void;
    closeOtherTabs(): void;
    closeAllTabs(): void;
  };
};
