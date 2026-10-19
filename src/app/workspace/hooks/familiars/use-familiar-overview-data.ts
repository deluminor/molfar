import { useMemo } from "react";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { artifactCards } from "@/features/artifacts/artifacts";
import { resolveFamiliarActivity } from "@/features/familiars/model/familiar-activity";
import { familiarSpawnedSessions } from "@/features/familiars/model/familiar-spawned-sessions";
import { sessionEditPaths } from "@/features/sessions/model/checkpoint-edits";
import { useSessionChangeTotals } from "@/features/sessions/ui/SessionReview";
import type { WorkspaceStore } from "../../store/types";
import { useWorkspaceField } from "../use-workspace-field";
import { useFamiliarLaunchedSessions } from "./use-familiar-launched-sessions";

/** What the open Familiar's chat and overview show, derived from its session. */
export function useFamiliarOverviewData(
  store: WorkspaceStore,
  familiarViewSession: Session | undefined,
  sessions: readonly Session[],
) {
  const familiarActivity = useWorkspaceField(store, "familiarActivity");
  const overviewOpen = useWorkspaceField(store, "familiarOverviewOpen");
  const overviewTab = useWorkspaceField(store, "familiarOverviewTab");
  const selectedActivity = resolveFamiliarActivity(familiarActivity, familiarViewSession);
  // The chat marks the turn whose activity the overview is showing.
  const activityShownTurnId =
    overviewOpen && overviewTab === "activity" ? selectedActivity?.turnId : undefined;

  const blocks = familiarViewSession?.blocks;
  const busy = !!familiarViewSession?.busy;
  const cwd = familiarViewSession ? sessionWorkCwd(familiarViewSession) : "";
  const editedPaths = useMemo(
    () => (blocks && !busy ? sessionEditPaths(blocks) : undefined),
    [blocks, busy],
  );
  // The session's changes, on the overview's tab instead of under a message.
  const changeTotals = useSessionChangeTotals(familiarViewSession?.id ?? "", cwd, {
    enabled: !familiarViewSession?.worktreeRemoved,
    busy,
    editedPaths,
  });

  const launches = useMemo(() => (blocks ? familiarSpawnedSessions(blocks) : []), [blocks]);
  const documents = useMemo(() => (blocks ? artifactCards(blocks) : []), [blocks]);
  const launchedSessions = useFamiliarLaunchedSessions(launches, sessions);

  return {
    selectedActivity,
    activityShownTurnId,
    cwd,
    changeTotals,
    launches,
    documents,
    launchedSessions,
  };
}
