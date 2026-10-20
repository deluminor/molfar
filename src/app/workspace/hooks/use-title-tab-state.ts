import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { findFamiliar } from "@/features/familiars/model/familiar";
import {
  type AppView,
  appViewTabId,
  familiarTabId,
  reconcileTitleTabOrder,
} from "@/features/workspace/model/app-view-tabs";
import type { WorkspaceTab } from "@/features/workspace/model/layout";

/**
 * The inset layout's title tabs beyond workspace tabs: open app views,
 * Familiars, and the order the user dragged them into.
 */
export function useTitleTabState(
  tabs: WorkspaceTab[],
  insetLayout: boolean,
  familiarsEnabled: boolean,
  familiarsSnap: unknown,
) {
  const [openAppViews, setOpenAppViews] = useState<AppView[]>([]);
  // Familiars open as title tabs in the inset layout, by Familiar id.
  const [openFamiliarTabs, setOpenFamiliarTabs] = useState<string[]>([]);
  const [titleTabOrder, setTitleTabOrder] = useState(() => tabs.map((tab) => tab.id));

  const rememberAppView = useCallback((view: AppView) => {
    setOpenAppViews((current) => (current.includes(view) ? current : [...current, view]));
  }, []);

  // A deleted Familiar, or Familiars turned off, drop their tabs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the roster is read through its snapshot
  const shownFamiliarTabs = useMemo(
    () => (insetLayout && familiarsEnabled ? openFamiliarTabs.filter((familiarId) => findFamiliar(familiarId)) : []),
    [insetLayout, familiarsEnabled, openFamiliarTabs, familiarsSnap],
  );

  useLayoutEffect(() => {
    if (!insetLayout) return;
    setTitleTabOrder((order) =>
      reconcileTitleTabOrder(order, [
        ...tabs.map((tab) => tab.id),
        ...openAppViews.map(appViewTabId),
        ...shownFamiliarTabs.map(familiarTabId),
      ]),
    );
  }, [insetLayout, tabs, openAppViews, shownFamiliarTabs]);

  return {
    openAppViews,
    setOpenAppViews,
    setOpenFamiliarTabs,
    titleTabOrder,
    setTitleTabOrder,
    rememberAppView,
    shownFamiliarTabs,
  };
}
