import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import type { WorkspaceStore } from "../../store/types";

type ChromeResetsInput = {
  store: WorkspaceStore;
  sidebarTab: SidebarTabId;
  setSidebarTab: (tab: SidebarTabId) => void;
  dockVisible: boolean;
};

/** The Inbox lives in its view, not the sidebar; a hidden dock gives up focus; the window keeps its traffic lights. */
export function useChromeResets({
  store,
  sidebarTab,
  setSidebarTab,
  dockVisible,
}: ChromeResetsInput): void {
  const { setProjectTerminalFocused } = useWorkspaceActions(store);

  useEffect(() => {
    if (sidebarTab === "inbox") setSidebarTab("sessions");
  }, [sidebarTab, setSidebarTab]);

  useEffect(() => {
    if (!dockVisible) setProjectTerminalFocused(false);
  }, [dockVisible]);

  useEffect(() => {
    void invoke("set_traffic_lights_visible", { visible: true }).catch(
      () => {},
    );
  }, []);
}
