import type { ComponentProps, ReactNode } from "react";
import type { Session } from "@/domain/session/session";
import { requestTranscriptJump } from "@/features/sessions/model/transcript-jump";
import type { AppView } from "@/features/workspace/model/app-view-tabs";
import { AppViewSurface } from "@/features/workspace/ui/AppViewSurface";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { AutomationsView, InboxView, NotesView, SearchView } from "./lazy-views";

type SearchProps = ComponentProps<typeof SearchView>;
type InboxProps = ComponentProps<typeof InboxView>;
type AutomationsProps = ComponentProps<typeof AutomationsView>;

type Props = {
  store: WorkspaceStore;
  insetLayout: boolean;
  /** Views kept mounted behind their title tabs in the inset layout. */
  openAppViews: readonly AppView[];
  notesEnabled: boolean;
  automationsOpen: boolean;
  besideRail: boolean;
  compactRail: boolean;
  gitCwd: string;
  sidebarCwd: string;
  scopeProject: InboxProps["scopeProject"];
  history: SearchProps["history"];
  sessions: readonly Session[];
  automationsFocusId: AutomationsProps["focusAutomationId"];
  /** Rendered between the search and inbox views. */
  inboxAsk: ReactNode;
  /** Rendered between the notes and automations views. */
  localSurfaces: ReactNode;
  onToggleSidebar: () => void;
  onOpenFile: SearchProps["onOpenFile"];
  onOpenHistorySession: (sessionId: string) => unknown;
  onOpenProject: SearchProps["onOpenProject"];
  onLeaveSearch: () => void;
  onLeaveNotes: () => void;
  inbox: Pick<
    InboxProps,
    | "onClose"
    | "onStart"
    | "onAsk"
    | "onAskRestart"
    | "sessions"
    | "repairSessions"
    | "onRepairChecks"
    | "onOpenSession"
    | "onOpenIntegrations"
  >;
  automations: Pick<
    AutomationsProps,
    "onFocusAutomationConsumed" | "onClose" | "onLaunch" | "onOpenSession"
  >;
};

/** Search, Inbox, Notes and Automations over the workspace. */
export function WorkspaceAppViews({
  store,
  insetLayout,
  openAppViews,
  notesEnabled,
  automationsOpen,
  besideRail,
  compactRail,
  gitCwd,
  sidebarCwd,
  scopeProject,
  history,
  sessions,
  automationsFocusId,
  inboxAsk,
  localSurfaces,
  onToggleSidebar,
  onOpenFile,
  onOpenHistorySession,
  onOpenProject,
  onLeaveSearch,
  onLeaveNotes,
  inbox,
  automations,
}: Props) {
  const searchOpen = useWorkspaceField(store, "searchViewOpen");
  const searchFocusToken = useWorkspaceField(store, "searchViewFocusToken");
  const inboxOpen = useWorkspaceField(store, "inboxViewOpen");
  const notesOpen = useWorkspaceField(store, "notesViewOpen");
  const recents = useWorkspaceField(store, "recents");
  const projectCwd = useWorkspaceField(store, "projectCwd");
  const { setInboxAskPortal } = useWorkspaceActions(store);
  const tabbed = (view: AppView) => insetLayout && openAppViews.includes(view);

  return (
    <>
      {searchOpen || tabbed("search") ? (
        <AppViewSurface active={searchOpen}>
          <SearchView
            tabbed={insetLayout}
            open={searchOpen}
            cwd={gitCwd}
            recents={recents}
            history={history}
            sessions={sessions.filter((session) => !session.inboxAsk)}
            focusToken={searchFocusToken}
            besideRail={besideRail}
            compactRail={compactRail}
            onClose={onLeaveSearch}
            onToggleSidebar={onToggleSidebar}
            onOpenFile={onOpenFile}
            onOpenSession={(sessionId, blockId, query) => {
              if (blockId) requestTranscriptJump(sessionId, blockId, query);
              void onOpenHistorySession(sessionId);
            }}
            onOpenProject={onOpenProject}
          />
        </AppViewSurface>
      ) : null}
      {inboxAsk}
      {inboxOpen || tabbed("inbox") ? (
        <AppViewSurface active={inboxOpen}>
          <InboxView
            {...inbox}
            tabbed={insetLayout}
            active={inboxOpen}
            cwd={sidebarCwd}
            scopeProject={scopeProject}
            recents={recents}
            besideRail={besideRail}
            compactRail={compactRail}
            onToggleSidebar={onToggleSidebar}
            onAskMount={setInboxAskPortal}
          />
        </AppViewSurface>
      ) : null}
      {notesOpen || (notesEnabled && tabbed("notes")) ? (
        <AppViewSurface active={notesOpen}>
          <NotesView
            tabbed={insetLayout}
            active={notesOpen}
            besideRail={besideRail}
            compactRail={compactRail}
            cwd={projectCwd}
            scopeProject={scopeProject}
            recents={recents}
            onClose={onLeaveNotes}
            onToggleSidebar={onToggleSidebar}
          />
        </AppViewSurface>
      ) : null}
      {localSurfaces}
      {automationsOpen || tabbed("automations") ? (
        <AppViewSurface active={automationsOpen}>
          <AutomationsView
            {...automations}
            tabbed={insetLayout}
            besideRail={besideRail}
            compactRail={compactRail}
            cwd={projectCwd}
            scopeProject={scopeProject}
            recents={recents}
            focusAutomationId={automationsFocusId}
            onToggleSidebar={onToggleSidebar}
          />
        </AppViewSurface>
      ) : null}
    </>
  );
}
