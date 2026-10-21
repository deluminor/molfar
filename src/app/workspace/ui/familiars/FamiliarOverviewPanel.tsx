import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import {
  type Familiar,
  familiarLook,
  familiarState,
} from "@/features/familiars/model/familiar";
import { FamiliarActivityView } from "@/features/familiars/ui/FamiliarActivityView";
import { FamiliarOverview } from "@/features/familiars/ui/FamiliarOverview";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { WindowControls } from "@/features/window-chrome/ui/WindowControls";
import { IS_MAC } from "@/shared/lib/platform";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import type { FamiliarOverviewData } from "../../hooks/familiars/use-familiar-overview-data";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import {
  type FamiliarShownSessionInput,
  useFamiliarShownSession,
} from "./use-familiar-shown-session";

type Props = {
  store: WorkspaceStore;
  familiar: Familiar;
  session: Session;
  overview: FamiliarOverviewData;
  sessions: readonly Session[];
  history: readonly SessionSummary[];
  shownSession: FamiliarShownSessionInput;
};

/** The open Familiar's overview beside its chat, over the workspace. */
export function FamiliarOverviewPanel({
  store,
  familiar,
  session,
  overview,
  sessions,
  history,
  shownSession,
}: Props) {
  const handlers = useWorkspaceHandlers();
  const shown = useFamiliarShownSession(store, shownSession);
  const open = useWorkspaceField(store, "familiarOverviewOpen");
  const tab = useWorkspaceField(store, "familiarOverviewTab");
  const documentId = useWorkspaceField(store, "familiarOverviewDocument");
  const changesRequest = useWorkspaceField(store, "familiarChangesRequest");
  const {
    setFamiliarOverviewOpen,
    setFamiliarOverviewTab,
    setFamiliarOverviewDocument,
    setFamiliarShownSession,
    setFamiliarShownSessionFocused,
  } = useWorkspaceActions(store);

  const activity = overview.selectedActivity;
  const activityView = activity ? (
    <FamiliarActivityView
      key={activity.turnId}
      blocks={activity.blocks}
      live={activity.live}
      cwd={sessionWorkCwd(session)}
      onApproval={
        session.worktreeRemoved
          ? undefined
          : (requestId, decision) => handlers.turns.approve(session.id, requestId, decision)
      }
      onOpenFile={handlers.files.open}
      onOpenDiff={handlers.tabs.openDiff}
    />
  ) : null;

  return (
    <FamiliarOverview
      key={familiar.id}
      open={open}
      familiarId={familiar.id}
      cwd={session.cwd}
      agent={familiarLook(familiar)}
      state={familiarState(session)}
      launches={overview.launches}
      sessions={sessions}
      history={history}
      documents={overview.documents}
      activity={activityView}
      changes={{
        sessionId: session.id,
        cwd: overview.cwd,
        totals: overview.changeTotals,
        request: changesRequest,
        textHarness: session.harness,
        projects: familiar.projects,
      }}
      tab={tab}
      onTabChange={setFamiliarOverviewTab}
      onOpenSession={(sessionId) => handlers.familiarView.showLaunchedSession(session.id, sessionId)}
      shownSession={shown}
      // Back lands on every session it started.
      onBackFromSession={() => {
        setFamiliarShownSession(null);
        setFamiliarShownSessionFocused(false);
      }}
      onOpenSessionInWorkspace={handlers.familiars.openLaunchedInWorkspace}
      onOpenDocument={(id) => {
        setFamiliarShownSession(null);
        setFamiliarOverviewDocument(id);
      }}
      shownDocumentId={documentId ?? undefined}
      onBackFromDocument={() => setFamiliarOverviewDocument(null)}
      onOpenFile={handlers.files.open}
      onClose={() => setFamiliarOverviewOpen(false)}
      windowControls={IS_MAC ? undefined : <WindowControls />}
    />
  );
}
