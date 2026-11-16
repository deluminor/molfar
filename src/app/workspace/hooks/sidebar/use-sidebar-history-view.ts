import { useMemo } from "react";
import type { Session } from "@/domain/session/session";
import type { OrchestrationRun } from "@/features/orchestration/model/orchestration";
import {
  historyWithLiveSessions,
  sameSessionSummaries,
} from "@/features/sessions/data/session-history";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { sameProjectPath } from "@/features/projects/model/recents";
import type { GitBranches } from "@/platform/tauri/fs";
import { useStableValue } from "@/shared/hooks/use-stable-value";
import { projectGitHint } from "./sidebar-rows";

type SidebarHistoryViewInput = {
  history: SessionSummary[];
  promptableSessions: Session[];
  sidebarCwd: string;
  projectBranches: GitBranches | null;
  orchestrationRuns: readonly OrchestrationRun[];
};

/** The sidebar project's saved chats, alone and merged with the live ones. */
export function useSidebarHistoryView({
  history,
  promptableSessions,
  sidebarCwd,
  projectBranches,
  orchestrationRuns,
}: SidebarHistoryViewInput): { projectHistory: SessionSummary[]; sidebarHistory: SessionSummary[] } {
  // `history` spans every visited project; consumers that expect the
  // current project only get this slice.
  const projectHistory = useMemo(
    () => history.filter((entry) => sameProjectPath(entry.cwd, sidebarCwd)),
    [history, sidebarCwd],
  );
  const sidebarHistoryRows = useMemo(
    () =>
      historyWithLiveSessions(
        history,
        // A habit's hidden run is never one of the project's chats.
        promptableSessions,
        sidebarCwd,
        projectGitHint(sidebarCwd, projectBranches?.current ?? undefined),
        orchestrationRuns,
      ),
    [
      history,
      projectBranches,
      promptableSessions,
      sidebarCwd,
      orchestrationRuns,
    ],
  );
  const sidebarHistory = useStableValue(
    sidebarHistoryRows,
    sameSessionSummaries,
  );

  return { projectHistory, sidebarHistory };
}
