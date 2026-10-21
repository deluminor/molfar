import type { ComponentProps } from "react";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import {
  type Familiar,
  familiarLook,
  familiarState,
} from "@/features/familiars/model/familiar";
import { FamiliarActivityView } from "@/features/familiars/ui/FamiliarActivityView";
import { FamiliarOverview } from "@/features/familiars/ui/FamiliarOverview";
import type { ShownFamiliarSession } from "@/features/familiars/ui/FamiliarSessionList";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { WindowControls } from "@/features/window-chrome/ui/WindowControls";
import { IS_MAC } from "@/shared/lib/platform";
import type { FamiliarOverviewData } from "../../hooks/familiars/use-familiar-overview-data";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type ActivityProps = ComponentProps<typeof FamiliarActivityView>;

type Props = {
  store: WorkspaceStore;
  familiar: Familiar;
  session: Session;
  overview: FamiliarOverviewData;
  sessions: readonly Session[];
  history: readonly SessionSummary[];
  shownSession?: ShownFamiliarSession;
  onShowLaunchedSession: (familiarSessionId: string, sessionId: string) => Promise<void>;
  onOpenSessionInWorkspace: (sessionId: string) => Promise<void>;
  onApproval: (
    sessionId: string,
    ...reply: Parameters<NonNullable<ActivityProps["onApproval"]>>
  ) => void;
  onOpenFile: NonNullable<ActivityProps["onOpenFile"]>;
  onOpenDiff: ActivityProps["onOpenDiff"];
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
  onShowLaunchedSession,
  onOpenSessionInWorkspace,
  onApproval,
  onOpenFile,
  onOpenDiff,
}: Props) {
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
          : (requestId, decision) => onApproval(session.id, requestId, decision)
      }
      onOpenFile={onOpenFile}
      onOpenDiff={onOpenDiff}
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
      onOpenSession={(sessionId) => onShowLaunchedSession(session.id, sessionId)}
      shownSession={shownSession}
      // Back lands on every session it started.
      onBackFromSession={() => {
        setFamiliarShownSession(null);
        setFamiliarShownSessionFocused(false);
      }}
      onOpenSessionInWorkspace={onOpenSessionInWorkspace}
      onOpenDocument={(id) => {
        setFamiliarShownSession(null);
        setFamiliarOverviewDocument(id);
      }}
      shownDocumentId={documentId ?? undefined}
      onBackFromDocument={() => setFamiliarOverviewDocument(null)}
      onOpenFile={onOpenFile}
      onClose={() => setFamiliarOverviewOpen(false)}
      windowControls={IS_MAC ? undefined : <WindowControls />}
    />
  );
}
