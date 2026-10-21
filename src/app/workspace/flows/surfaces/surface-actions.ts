import type { ConnectableInboxSource } from "@/features/inbox/model/inbox-filters";
import type { SettingsSectionId } from "@/features/settings/model/settings";
import type { SettingsAnchor } from "@/features/settings/ui/SettingsView";
import { releaseNotesForVersion } from "@/features/updates/model/release-notes";
import { alertApp } from "@/shared/lib/app-dialog";
import {
  findInProject,
  openAppView,
  openConversation,
  openFilePicker,
  railBack,
  railForward,
} from "./overlay-views";
import {
  closeSettings,
  openNotificationSettings,
  openSettings,
  selectSettingsSection,
} from "./settings-surface";
import type { SurfaceDeps } from "./surface-deps";

/** The view, Settings and rail navigation flows bound to `deps`, created once for the workspace. */
export function createSurfaceActions(deps: SurfaceDeps) {
  const showSettings = (section?: SettingsSectionId, anchor?: SettingsAnchor) =>
    openSettings(deps, section, anchor);
  const leaveSettings = () => closeSettings(deps);
  const {
    setSearchViewOpen,
    setInboxViewOpen,
    setNotesViewOpen,
    setSettingsOpen,
    setRemoteProjectDialogOpen,
    setWhatsNewVersion,
  } = deps.store.getState();

  return {
    goToFile: () => openFilePicker(deps, ""),
    openCommandPalette: () => openFilePicker(deps, ">"),
    findInProject: () => findInProject(deps),
    openSearch: () => openAppView(deps, "search"),
    openInbox: () => openAppView(deps, "inbox"),
    openNotes: () => openAppView(deps, "notes"),
    openAutomations: () => openAppView(deps, "automations"),
    leaveSearch: () => setSearchViewOpen(false),
    leaveInbox: () => setInboxViewOpen(false),
    leaveNotes: () => setNotesViewOpen(false),
    leaveAutomations: () => deps.setAutomationsViewOpen(false),
    openConversation: (sessionId: string) => openConversation(deps, sessionId),
    openSettings: showSettings,
    openSettingsHome: () => showSettings(),
    openReminderSettings: () => showSettings("general", "notifications"),
    manageWorktrees: () => showSettings("worktrees"),
    manageProviderAccounts: () => showSettings("providers", "provider-accounts"),
    openInboxIntegrations: (source: ConnectableInboxSource) => showSettings("inbox", source),
    openNotificationSettings: (path?: string) => openNotificationSettings(deps, path),
    selectSettingsSection: (section: SettingsSectionId) => selectSettingsSection(deps, section),
    closeSettings: leaveSettings,
    openArchivedSession: (sessionId: string) => {
      setSettingsOpen(false);
      void deps.selectHistorySession(sessionId);
    },
    openRemoteProjectDialog: () => setRemoteProjectDialogOpen(true),
    railBack: () => railBack(deps, leaveSettings),
    railForward: () => railForward(deps),
    openWhatsNew: (version: string) => {
      const document = releaseNotesForVersion(version);
      if (!document) {
        void alertApp("Release notes for this version are not available in this build.");
        return;
      }
      setWhatsNewVersion(document.source.version);
    },
  };
}

export type SurfaceActions = ReturnType<typeof createSurfaceActions>;
