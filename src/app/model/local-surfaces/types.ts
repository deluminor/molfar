import type {
  Dispatch,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from "react";
import type { LocalSurfaceId } from "../../../features/home/ui/LocalSurfaceRailActions";
import type { SidebarTabId } from "../../../features/settings/model/appearance";
import type { RailSurfaceVisibility } from "../../../features/settings/model/projectRail";
import type { SessionSummary } from "../../../features/sessions/data/sessionStore";
import type { Session } from "../../../features/sessions/model/session";

type SetFlag = Dispatch<SetStateAction<boolean>>;

export interface LocalSurfaceState {
  localSurface: LocalSurfaceId | null;
  setLocalSurface: Dispatch<SetStateAction<LocalSurfaceId | null>>;
  localSurfaceRef: MutableRefObject<LocalSurfaceId | null>;
  automationsSurfaceOpen: boolean;
  setAutomationsSurfaceOpen: SetFlag;
  automationsSurfaceOpenRef: MutableRefObject<boolean>;
  automationsFocusId: string | null;
  setAutomationsFocusId: Dispatch<SetStateAction<string | null>>;
  /** Automations or any local surface covers the workspace. */
  automationsViewOpen: boolean;
  setAutomationsViewOpen: (open: boolean) => void;
  railSurfaces: RailSurfaceVisibility;
}

export interface LocalSurfaceActionDeps {
  surfaces: LocalSurfaceState;
  setFilePickerOpen: SetFlag;
  setSettingsOpen: SetFlag;
  setSearchViewOpen: SetFlag;
  setInboxViewOpen: SetFlag;
  setNotesViewOpen: SetFlag;
  setSidebarTab: (tab: SidebarTabId, project?: string) => void;
  sessionsRef: MutableRefObject<Session[]>;
  history: readonly SessionSummary[];
  onSelectHistorySession: (sessionId: string) => Promise<unknown>;
}

export interface LocalSurfaceActions {
  onOpenLocalSurface: (id: LocalSurfaceId) => void;
  onOpenKnowledge: () => void;
  onLeaveLocalSurface: () => void;
  onOpenHomeSession: (sessionId: string) => void;
  onOpenHomeAutomation: (automationId: string) => void;
  onAutomationsFocusConsumed: () => void;
  localSurfaceRailActions: ReactNode;
}
