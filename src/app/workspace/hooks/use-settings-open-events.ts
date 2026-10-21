import { useEffect } from "react";
import {
  OPEN_CONNECTIONS_EVENT,
  OPEN_REMOTE_PROJECT_EVENT,
} from "@/features/connections/model/connections";
import type { SettingsSectionId } from "@/features/settings/model/settings";

const OPEN_MCP_SETTINGS_EVENT = "molfar:open-mcp-settings";

/** Opens Settings sections and the remote project dialog when other windows' views ask for them. */
export function useSettingsOpenEvents(
  openSettings: (section: SettingsSectionId) => void,
  openRemoteProjectDialog: () => void,
): void {
  useEffect(() => {
    const openConnections = () => openSettings("connections");
    const openMcp = () => openSettings("mcp");
    window.addEventListener(OPEN_CONNECTIONS_EVENT, openConnections);
    window.addEventListener(OPEN_REMOTE_PROJECT_EVENT, openRemoteProjectDialog);
    window.addEventListener(OPEN_MCP_SETTINGS_EVENT, openMcp);

    return () => {
      window.removeEventListener(OPEN_CONNECTIONS_EVENT, openConnections);
      window.removeEventListener(OPEN_REMOTE_PROJECT_EVENT, openRemoteProjectDialog);
      window.removeEventListener(OPEN_MCP_SETTINGS_EVENT, openMcp);
    };
  }, [openSettings, openRemoteProjectDialog]);
}
