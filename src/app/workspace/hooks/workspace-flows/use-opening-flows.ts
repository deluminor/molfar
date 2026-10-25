import { useSessionReminders } from "@/features/notifications/hooks/use-session-reminders";
import { useDeckProjectTabs } from "../../title-tabs/use-deck-project-tabs";
import { useReopenFamiliar } from "../lifecycle/use-boot-effects";
import { useHistoryFlows } from "../flows/use-history-flows";
import { useProjectFlows } from "../flows/use-project-flows";
import { useSessionOpenerFlows } from "../flows/use-session-opener-flows";
import { useSurfaceFlows } from "../flows/use-surface-flows";
import { useTabFlows } from "../flows/use-tab-flows";
import type { WorkspaceFlowCore } from "../flows/workspace-flow-core";
import { useInboxAskFocus } from "../inbox/use-inbox-effects";
import { useTabVisitsSync } from "../tabs/use-tab-effects";
import { useAddNoteToChat } from "../use-add-note-to-chat";
import { useLatestRef } from "../use-latest-ref";
import { useSettingsOpenEvents } from "../use-settings-open-events";
import type { WorkspaceFlowsInput } from "./types";

/** Tabs, session openers, surfaces, reminders, history and project flows, with the effects between them. */
export function useOpeningFlows(flowCore: WorkspaceFlowCore, input: WorkspaceFlowsInput) {
  const { core, inbox, familiarView } = input;
  const { tabs, activeTabId, sessions } = core;

  const tabFlows = useTabFlows(flowCore, {
    terminalCwdRef: input.terminalCwdRef,
    displayedTabNavigation: core.displayedTabNavigation,
  });

  useTabVisitsSync(input.tabVisits, tabs, activeTabId);

  useAddNoteToChat(inbox.inboxActions.addNoteToChat);

  const deckProjectTabs = useDeckProjectTabs({
    tabs,
    activeTabId,
    sessions,
    projectCwd: core.projectCwd,
    worktreePath: core.projectWorktree?.path,
    tabWorkspace: core.tabWorkspace,
    navigationRevision: input.navigation.revision,
  });

  const deckProjectTabsRef = useLatestRef(deckProjectTabs);
  const openerFlows = useSessionOpenerFlows(flowCore, {
    tabFlows,
    visits: input.tabVisits,
    linkedUpdateCards: inbox.linkedUpdateCards,
    linkedUpdatesRef: inbox.linkedUpdatesRef,
    navigationIdsRef: core.sessionNavigationIdsRef,
    deckTabsRef: deckProjectTabsRef,
  });
  const { tabActions, sessionOpeners } = openerFlows;

  useInboxAskFocus(core.inboxAskPortal, core.inboxViewOpen, core.setComposerFocused);

  useReopenFamiliar(core.familiarsEnabled, familiarView.open, input.windowTransfer);

  const familiarsEnabledRef = useLatestRef(core.familiarsEnabled);
  const surfaceFlows = useSurfaceFlows(flowCore, {
    tabActions,
    sessionOpeners,
    localSurfaces: core.localSurfaces,
    settingsReturnView: core.settingsReturnViewRef,
    rememberAppView: core.rememberAppView,
    familiarsEnabledRef,
    linkedUpdateCards: inbox.linkedUpdateCards,
    dismissDueReminder: (sessionId) => sessionRemindersRef.current.dismissDue(sessionId),
  });
  const { surfaces, reminders } = surfaceFlows;
  useSettingsOpenEvents(surfaces.openSettings, surfaces.openRemoteProjectDialog);
  const sessionReminders = useSessionReminders(
    surfaces.openConversation,
    reminders.ensureSaved,
    sessions
      .filter((session) => !session.inboxAsk)
      .map((session) => session.id),
  );
  const sessionRemindersRef = useLatestRef(sessionReminders);

  const historyFlows = useHistoryFlows(flowCore, {
    tabFlows,
    deleteConfirmationPending: core.deleteConfirmationPending,
    automationsViewOpenRef: core.automationsViewOpenRef,
  });

  const projectFlows = useProjectFlows(flowCore, {
    tabFlows,
    worktreeActions: historyFlows.worktreeActions,
    projectTerminalsRef: core.projectTerminalsRef,
    setSidebarTabSelection: input.sidebar.setSidebarTabSelection,
    readProjectReturnMemory: input.readProjectReturnMemory,
    editorNavigationToken: core.editorNavigationToken,
  });

  return { tabFlows, deckProjectTabs, openerFlows, surfaceFlows, sessionReminders, historyFlows, projectFlows };
}
