import {
  createFamiliar,
  familiarForSession,
  findFamiliar,
} from "@/features/familiars/model/familiar";
import { ensureFamiliarSession } from "@/features/familiars/model/familiar-workspace";
import { newDefaultSession } from "@/features/sessions/model/session";
import { homeDir } from "@/platform/tauri/fs";
import { useFloatingFamiliar } from "../../../hooks/use-floating-familiar";
import { useWorkspaceChrome } from "../../ui/layout/use-workspace-chrome";
import { commandActions } from "../commands/command-actions";
import type { CommandDeps } from "../commands/command-deps";
import { useCommandRunner } from "../commands/use-command-runner";
import { useMenuCommands } from "../commands/use-menu-commands";
import { useNativeKeybindings } from "../commands/use-native-keybindings";
import { useWorkspaceKeys } from "../commands/use-workspace-keys";
import { useFamiliarOverviewData } from "../familiars/use-familiar-overview-data";
import { useDockSlide } from "../use-dock-slide";
import { useLatestRef } from "../use-latest-ref";
import { useRightPanelSlide } from "../use-right-panel";
import { useStableFlow } from "../use-stable-flow";
import type { WorkspaceViewFlowsInput } from "./types";
import type { useNavigationViewFlows } from "./use-navigation-view-flows";

/** Commands and shortcuts, the terminal dock slide, the floating Familiar, the Familiar overview and the chrome. */
export function useChromeViewFlows(
  input: WorkspaceViewFlowsInput,
  navigation: ReturnType<typeof useNavigationViewFlows>,
) {
  const { core, flows, turnActions, familiarCovers, familiarViewSession } = input;
  const { workspaceStore, automationsViewOpenRef, insetLayoutRef, sessionsRef, setSessions, sessions } = core;
  const { currentProjectDock, projectCwd, insetLayout, familiarsSnap, familiarsEnabled, onOpenMonoArtifact } = core;
  const { familiarViewId, automationsViewOpen, activeAppView } = core;
  const { open: rightPanelOpen, closing: rightPanelClosing, setClosing: setRightPanelClosing } = core.rightPanel;
  const { toggle: onToggleRightPanel, paneRef: rightPanelRef } = core.rightPanel;
  const { isMainWindow, projectFlows, turnQueueFlows } = flows;
  const { terminals } = flows.tabFlows;
  const { sessionOpeners } = flows.openerFlows;
  const { submission } = flows.submissionFlows;
  const onOpenFamiliar = input.familiarView.open;
  const { sidebarCwd } = input.cwds;

  const actions = useLatestRef(commandActions(navigation.titleTabFlows.handlers));
  const run = useCommandRunner();
  const isMainWindowRef = useLatestRef(isMainWindow);
  const commandDeps = useStableFlow(
    (): CommandDeps => ({
      actions,
      run,
      surfaces: () => {
        const state = workspaceStore.getState();
        return {
          search: state.searchViewOpen,
          inbox: state.inboxViewOpen,
          notes: state.notesViewOpen,
          automations: automationsViewOpenRef.current,
          settings: state.settingsOpen,
          filePicker: state.filePickerOpen,
          whatsNew: Boolean(state.whatsNewVersion),
          insetLayout: insetLayoutRef.current,
        };
      },
      sessions: () => sessionsRef.current,
      isMainWindow: () => isMainWindowRef.current,
    }),
  );
  useNativeKeybindings();
  useWorkspaceKeys(commandDeps);
  useMenuCommands(commandDeps);

  const dockSlide = useDockSlide({
    dock: currentProjectDock,
    projectCwd,
    familiarCovers,
    insetLayout,
    paintTarget: terminals.dockPaintTarget,
    commitSize: terminals.setDockSize,
  });

  useFloatingFamiliar(sessions, familiarsSnap, familiarsEnabled, {
    open: (monoId) =>
      ensureFamiliarSession(monoId, {
        home: homeDir,
        load: sessionOpeners.ensureOpen,
        create: newDefaultSession,
        add: (created) => {
          sessionsRef.current = [...sessionsRef.current, created];
          setSessions(sessionsRef.current);
        },
      }),
    submit: submission.send,
    stop: turnActions.stop,
    approval: turnActions.approve,
    question: turnActions.answer,
    questionInteraction: turnActions.keepQuestionOpen,
    reveal: onOpenFamiliar,
    openArtifact: async (monoId, id) => {
      await onOpenFamiliar(monoId);
      const sessionId = findFamiliar(monoId)?.sessionId;
      if (sessionId) onOpenMonoArtifact(sessionId, id);
    },
    openFile: projectFlows.fileActions.open,
    resume: turnQueueFlows.usageLimits.resume,
    create: () => createFamiliar().id,
  });

  // Renames, mascot picks and new projects show up on the rail.
  const familiarViewFamiliar = familiarViewId ? familiarForSession(familiarViewId) : undefined;
  const familiarOverview = useFamiliarOverviewData(workspaceStore, familiarViewSession, sessions);

  const chrome = useWorkspaceChrome(workspaceStore, {
    insetLayout,
    automationsViewOpen,
    rightPanelOpen,
    rightPanelClosing,
    activeAppView,
    sidebarCwd,
  });
  useRightPanelSlide(
    rightPanelOpen,
    rightPanelClosing,
    chrome.insetRightPanelShown,
    rightPanelRef,
    setRightPanelClosing,
  );
  navigation.rightPanelToggleRef.current =
    chrome.showRightPanelToggle && !(familiarCovers && familiarViewFamiliar) && !activeAppView
      ? onToggleRightPanel
      : null;

  return { dockSlide, familiarViewFamiliar, familiarOverview, chrome };
}
