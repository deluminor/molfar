import { upsertSession } from "@/features/sessions/data/session-store";
import type { LocalSurfaceState } from "../../../model/local-surfaces/types";
import { createFamiliarActions } from "../../flows/familiars/familiar-actions";
import { createInboxAsk } from "../../flows/inbox/inbox-ask";
import type { createLinkedUpdateCards } from "../../flows/linked-work-items/linked-update-card";
import { createReminderActions, type ReminderActionsDeps } from "../../flows/reminders/reminder-actions";
import { createSurfaceActions } from "../../flows/surfaces/surface-actions";
import type { SurfaceDeps } from "../../flows/surfaces/surface-deps";
import { useStableFlow } from "../use-stable-flow";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type SurfaceFlowsInput = Pick<SessionOpenerFlows, "tabActions" | "sessionOpeners"> & {
  localSurfaces: Pick<
    LocalSurfaceState,
    "setAutomationsSurfaceOpen" | "setLocalSurface" | "automationsSurfaceOpenRef" | "localSurfaceRef"
  >;
  settingsReturnView: SurfaceDeps["settingsReturnView"];
  rememberAppView: SurfaceDeps["rememberAppView"];
  familiarsEnabledRef: { readonly current: boolean };
  linkedUpdateCards: Pick<ReturnType<typeof createLinkedUpdateCards>, "update">;
  dismissDueReminder: ReminderActionsDeps["dismissDueReminder"];
};

export function createSurfaceFlows(core: WorkspaceFlowCore, input: SurfaceFlowsInput) {
  const { store, sessionsRef } = core;
  const { tabActions, sessionOpeners, localSurfaces } = input;

  const inboxAsk = createInboxAsk({
    store,
    sessionsRef,
    setSessions: core.setSessions,
    sidebarCwd: () => core.sidebarCwdRef.current,
    removingSessionIds: core.removingSessionIds,
    stopSessionForRemoval: (sessionId) => core.stopSessionForRemoval(sessionId),
  });

  const familiarActions = createFamiliarActions({
    store,
    view: core.familiarView,
    familiarsEnabled: () => input.familiarsEnabledRef.current,
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    setSidebarTab: (tab, project) => core.setSidebarTab(tab, project),
    selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
  });

  const surfaceDeps: SurfaceDeps = {
    store,
    setAutomationsViewOpen: core.setAutomationsViewOpen,
    setAutomationsSurfaceOpen: localSurfaces.setAutomationsSurfaceOpen,
    setLocalSurface: localSurfaces.setLocalSurface,
    automationsSurfaceOpen: () => localSurfaces.automationsSurfaceOpenRef.current,
    localSurface: () => localSurfaces.localSurfaceRef.current,
    settingsReturnView: input.settingsReturnView,
    rememberAppView: (view) => input.rememberAppView(view),
    cancelNavigation: () => core.navigation.cancel(),
    closeFamiliarView: () => core.familiarView.close(),
    setSidebarTab: (tab, project) => core.setSidebarTab(tab, project),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    visitBack: () => tabActions.visitBack(),
    visitForward: () => tabActions.visitForward(),
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
  };
  const surfaces = createSurfaceActions(surfaceDeps);

  const reminders = createReminderActions({
    sessionsRef,
    upsertSession,
    dismissDueReminder: (sessionId) => input.dismissDueReminder(sessionId),
    updateLinkedCard: input.linkedUpdateCards.update,
  });

  return { inboxAsk, familiarActions, surfaceDeps, surfaces, reminders };
}

export type SurfaceFlows = ReturnType<typeof createSurfaceFlows>;

/** The inbox ask pane, Familiar shortcuts, surface navigation and reminders, created once. */
export function useSurfaceFlows(core: WorkspaceFlowCore, input: SurfaceFlowsInput): SurfaceFlows {
  return useStableFlow(() => createSurfaceFlows(core, input));
}
