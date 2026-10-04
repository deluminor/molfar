import type { LinkedWorkItem } from "@/domain/session/session";
import type { InboxSessionPortal } from "@/features/inbox/ui/InboxDiscussionPanel";
import type { OrchestrationWorkerDetail } from "@/features/orchestration/ui/orchestration-actions";
import type { SettingsSectionId } from "@/features/settings/model/settings";
import type { SettingsAnchor } from "@/features/settings/ui/SettingsView";
import type { StateUpdate } from "./state-update";

export type LinkedWorkItemPanelState = {
  item: LinkedWorkItem;
  sessionId: string;
  cwd: string;
};

export type WorkerDetailRequest = {
  leadId: string;
  workers: OrchestrationWorkerDetail[];
};

/** Full-window surfaces shown over the workspace, and what they focus. */
export type SurfacesState = {
  searchViewOpen: boolean;
  /** Bumped to focus the search field again. */
  searchFocusToken: number;
  searchViewFocusToken: number;
  inboxViewOpen: boolean;
  /** Linked work item side panels, by session id. */
  linkedWorkItemPanels: ReadonlyMap<string, LinkedWorkItemPanelState>;
  inboxAskPortal: InboxSessionPortal | null;
  notesViewOpen: boolean;
  /** Orchestration worker shown in its lead's panel. */
  inspectedWorkerId: string | null;
  /**
   * Set while the lead's tab is still opening; the agent tab lands on the
   * commit that brings it in.
   */
  workerDetailRequest: WorkerDetailRequest | null;
  settingsOpen: boolean;
  settingsSection: SettingsSectionId;
  settingsAnchor: SettingsAnchor | null;
  /** Project whose notification settings are open. */
  notificationProjectPath: string | null;
  notificationSettingsRequest: number;
};

export type SurfacesActions = {
  setSearchViewOpen: (update: StateUpdate<boolean>) => void;
  setSearchFocusToken: (update: StateUpdate<number>) => void;
  setSearchViewFocusToken: (update: StateUpdate<number>) => void;
  setInboxViewOpen: (update: StateUpdate<boolean>) => void;
  setLinkedWorkItemPanels: (
    update: StateUpdate<ReadonlyMap<string, LinkedWorkItemPanelState>>,
  ) => void;
  setInboxAskPortal: (update: StateUpdate<InboxSessionPortal | null>) => void;
  setNotesViewOpen: (update: StateUpdate<boolean>) => void;
  setInspectedWorkerId: (update: StateUpdate<string | null>) => void;
  setWorkerDetailRequest: (
    update: StateUpdate<WorkerDetailRequest | null>,
  ) => void;
  setSettingsOpen: (update: StateUpdate<boolean>) => void;
  setSettingsSection: (update: StateUpdate<SettingsSectionId>) => void;
  setSettingsAnchor: (update: StateUpdate<SettingsAnchor | null>) => void;
  setNotificationProjectPath: (update: StateUpdate<string | null>) => void;
  setNotificationSettingsRequest: (update: StateUpdate<number>) => void;
};
