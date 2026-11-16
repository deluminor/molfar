import { useMemo, useRef } from "react";
import { familiarForSession } from "@/features/familiars/model/familiar";
import { type AppView, appViewTabId, familiarTabId } from "@/features/workspace/model/app-view-tabs";
import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
import type { VisibleTabs } from "./displayed-tabs-deps";
import { type TitleTabListInput, titleTabList } from "./title-tab-list";
import { titleTabsEqual } from "./title-tabs-equal";

type TitleTabsViewInput = Omit<TitleTabListInput, "projectTabs" | "familiarTabs" | "order" | "shownViewTabId"> & {
  deckProjectTabs: TitleTabListInput["projectTabs"];
  shownFamiliarTabs: string[];
  titleTabOrder: string[];
  settingsOpen: boolean;
  familiarViewId: string | null;
  /** The Familiar roster's snapshot; the roster itself is read through it. */
  familiarsSnap: unknown;
  activeAppView: AppView | undefined;
  activeTabId: string;
  /** Tab id -> project name, kept in sync with the rendered title tabs. */
  tabProjectsRef: { current: Map<string, string> };
};

export type TitleTabsView = {
  /** Keeps its identity while the tabs look the same. */
  titleTabs: TitleTab[];
  /** The title tab shown as active: none under Settings, else the covering Familiar or view, else the workspace tab. */
  displayedActiveId: string;
  visibleTabs: VisibleTabs;
};

/** The title bar's tabs and which one shows as active. */
export function useTitleTabsView({
  deckProjectTabs,
  shownFamiliarTabs,
  titleTabOrder,
  settingsOpen,
  familiarViewId,
  familiarsSnap,
  activeAppView,
  activeTabId,
  tabProjectsRef,
  ...listInput
}: TitleTabsViewInput): TitleTabsView {
  const familiarCovers = !!familiarViewId;
  const familiarViewTabId = useMemo(() => {
    const familiarId = familiarViewId ? familiarForSession(familiarViewId)?.id : undefined;
    return familiarId ? familiarTabId(familiarId) : undefined;
  }, [familiarViewId, familiarsSnap]);
  const shownViewTabId = settingsOpen
    ? undefined
    : familiarCovers
      ? familiarViewTabId
      : activeAppView
        ? appViewTabId(activeAppView)
        : undefined;
  const nextTitleTabs = titleTabList({
    ...listInput,
    projectTabs: deckProjectTabs,
    familiarTabs: shownFamiliarTabs,
    order: titleTabOrder,
    shownViewTabId,
  });
  tabProjectsRef.current = new Map(
    nextTitleTabs.map((tab) => [tab.id, tab.project]),
  );
  const titleTabsRef = useRef(nextTitleTabs);
  if (!titleTabsEqual(titleTabsRef.current, nextTitleTabs)) {
    titleTabsRef.current = nextTitleTabs;
  }
  const titleTabs = titleTabsRef.current;

  return {
    titleTabs,
    displayedActiveId: settingsOpen
      ? ""
      : familiarCovers
        ? (familiarViewTabId ?? "")
        : (shownViewTabId ?? activeTabId),
    visibleTabs: {
      insetLayout: listInput.insetLayout,
      familiarTabId: familiarCovers ? familiarViewTabId : undefined,
      activeAppView,
      activeTabId,
      titleTabs,
    },
  };
}
