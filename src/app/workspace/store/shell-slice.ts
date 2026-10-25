import type { HarnessId } from "@/domain/harness/harness";
import type { SessionDeleteChoice } from "@/features/sessions/ui/DeleteSessionDialog";
import type { CollapsedProjectRailMode } from "@/features/settings/model/settings";
import type { InstalledUpdate } from "@/features/updates/model/update-notice";
import type { StateUpdate } from "./state-update";

export type ProviderSignInRequest = {
  key: string;
  sessionId: string;
  harness: HarnessId;
};

/** Asks whether a deleted session's unused worktree goes with it. */
export type SessionDeleteDialog = {
  title: string;
  unusedWorktree: string;
  resolve: (choice: SessionDeleteChoice) => void;
};

/** Window chrome around the workspace: rails, notices and dialogs. */
export type ShellState = {
  projectRailOpen: boolean;
  sessionSidebarOpen: boolean;
  collapsedProjectRailMode: CollapsedProjectRailMode;
  /** Update installed since the last launch, until its notice is dismissed. */
  updateNotice: InstalledUpdate | null;
  whatsNewVersion: string | null;
  providerSignInRequest: ProviderSignInRequest | null;
  sessionDeleteDialog: SessionDeleteDialog | undefined;
  remoteProjectDialogOpen: boolean;
};

export type ShellActions = {
  setProjectRailOpen: (update: StateUpdate<boolean>) => void;
  setSessionSidebarOpen: (update: StateUpdate<boolean>) => void;
  setCollapsedProjectRailMode: (
    update: StateUpdate<CollapsedProjectRailMode>,
  ) => void;
  setUpdateNotice: (update: StateUpdate<InstalledUpdate | null>) => void;
  setWhatsNewVersion: (update: StateUpdate<string | null>) => void;
  setProviderSignInRequest: (
    update: StateUpdate<ProviderSignInRequest | null>,
  ) => void;
  setSessionDeleteDialog: (
    update: StateUpdate<SessionDeleteDialog | undefined>,
  ) => void;
  setRemoteProjectDialogOpen: (update: StateUpdate<boolean>) => void;
};
