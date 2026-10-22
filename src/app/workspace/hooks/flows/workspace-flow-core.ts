import type { Session } from "@/domain/session/session";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { useWorkspaceNavigation } from "../../../hooks/use-workspace-navigation";
import type { FamiliarView } from "../../flows/familiars/familiar-view";
import type { SessionLoader } from "../../flows/session-history/session-loader";
import type { SessionPersistence } from "../../flows/session-history/session-persistence";
import type { WorkspaceStore } from "../../store/types";
import type { WorkspaceSessions } from "../use-workspace-sessions";

/**
 * What the Workspace hands every flow builder: its store, the refs it publishes each render
 * and the callbacks it owns. Built once on the first render, so every member is read at call time.
 */
export type WorkspaceFlowCore = {
  store: WorkspaceStore;
  sessionsRef: WorkspaceSessions["sessionsRef"];
  setSessions: WorkspaceSessions["setSessions"];
  tabsRef: { current: WorkspaceTab[] };
  activeTabIdRef: { current: string };
  projectCwdRef: { current: string };
  sidebarCwdRef: { readonly current: string };
  /** The git root of what is in view, as last rendered. */
  gitCwdRef: { readonly current: string };
  /** The focused session (or the first one) as last rendered. */
  sessionDefaultsRef: { readonly current: Session | undefined };
  activeTabRef: { readonly current: WorkspaceTab | undefined };
  insetLayoutRef: { readonly current: boolean };
  persistence: SessionPersistence;
  loader: SessionLoader;
  loadedSessionCache: { readonly current: Map<string, Session> };
  openingSessionIds: { readonly current: Set<string> };
  removingSessionIds: { readonly current: Set<string> };
  familiarView: FamiliarView;
  /** The workspace switch's stable controls; its render state is not here. */
  navigation: Pick<ReturnType<typeof useWorkspaceNavigation>, "cancel">;
  /** Makes a tab active without leaving a running workspace switch. */
  setActiveTabId(tabId: string): void;
  /** Makes a tab active as a click does: cancels a workspace switch, leaves a covering Familiar. */
  selectTab(tabId: string): void;
  setComposerFocused(focused: boolean): void;
  setAutomationsViewOpen(open: boolean): void;
  setSidebarTab(tab: SidebarTabId, project?: string): void;
  leaveCoveringFamiliar(): void;
  refreshHistory(cwd: string): Promise<void>;
  projectOfTab(tabId: string): string | undefined;
  tabWorkspace(tab: WorkspaceTab, sessions: readonly Session[]): string | null;
};
