import { useMemo, useSyncExternalStore } from "react";
import type { Session } from "@/domain/session/session";
import { sessionNeedsInput, sessionWorkCwd } from "@/domain/session/session-state";
import { familiarForSession } from "@/features/familiars/model/familiar";
import { isRemoteProjectPath, sameProjectPath } from "@/features/projects/model/recents";
import { sameSessionSummaries } from "@/features/sessions/data/session-history";
import { loadFamiliarsEnabled, subscribeFamiliarsEnabled } from "@/features/settings/model/settings";
import { useProjectBranches } from "@/features/source-control/hooks/use-project-branches";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { useStableValue } from "@/shared/hooks/use-stable-value";
import { normalizePath } from "@/shared/lib/paths";
import { selectedChangeKind, selectedChangePath, selectedCommitSha } from "../../../model/selected-change";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import type { WorkspaceStore } from "../../store/types";
import { useFamiliarRail } from "../familiars/use-familiar-rail";
import { useSessionIdSet } from "../use-session-id-set";
import { useWorkspaceField } from "../use-workspace-field";
import {
  busyProjectPaths,
  openProjectSessionRows,
  type TabWorkspace,
  worktreeTabStats,
} from "./sidebar-rows";

type WorkspaceSwitch = {
  pending: { project: string } | null;
  error: { project: string; message: string } | null;
  /** Moves when a workspace pin changes, which `tabWorkspace` reads. */
  revision: number;
};

export type SidebarModelInput = {
  cwd: string;
  gitCwd: string;
  liveSessions: Session[];
  activeTab: WorkspaceTab | undefined;
  activeSession: Session | undefined;
  tabWorkspace: TabWorkspace;
  workspaceSwitch: WorkspaceSwitch;
  unseenFamiliarReplies: ReadonlyMap<string, number>;
};

/** The sidebar's rows and markers derived from the open sessions, tabs and history state. */
export function useSidebarModel(
  store: WorkspaceStore,
  {
    cwd,
    gitCwd,
    liveSessions,
    activeTab,
    activeSession,
    tabWorkspace,
    workspaceSwitch,
    unseenFamiliarReplies,
  }: SidebarModelInput,
) {
  const handlers = useWorkspaceHandlers();
  const tabs = useWorkspaceField(store, "tabs");
  const loadedProjects = useWorkspaceField(store, "loadedProjects");
  const historyErrorCwd = useWorkspaceField(store, "historyErrorCwd");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const familiarsEnabled = useSyncExternalStore(
    subscribeFamiliarsEnabled,
    loadFamiliarsEnabled,
    () => true,
  );
  const projectBranch =
    useProjectBranches(cwd, Boolean(cwd) && cwd !== "~")?.current ?? undefined;
  const gitCwdBranches = useProjectBranches(
    gitCwd,
    Boolean(gitCwd) && gitCwd !== "~" && !isRemoteProjectPath(cwd),
  );

  const cwdKey = cwd && cwd !== "~" ? normalizePath(cwd) : null;
  const historyFailed = cwdKey != null && historyErrorCwd === cwdKey;
  const explorerRootLabel =
    activeSession?.worktreeCwd && sameProjectPath(gitCwd, sessionWorkCwd(activeSession))
      ? activeSession.branch || gitCwdBranches?.current || undefined
      : undefined;

  const { revision } = workspaceSwitch;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tabWorkspace` reads pins that move with `revision`.
  const tabStats = useMemo(
    () => worktreeTabStats(tabs, liveSessions, cwd, tabWorkspace),
    [tabs, liveSessions, cwd, tabWorkspace, revision],
  );
  const openSessions = useStableValue(
    useMemo(
      () => openProjectSessionRows(liveSessions, cwd, projectBranch),
      [liveSessions, cwd, projectBranch],
    ),
    sameSessionSummaries,
  );
  const busyPaths = useStableValue(busyProjectPaths(liveSessions));
  const approvalSessionIds = useSessionIdSet(liveSessions, sessionNeedsInput);
  const familiars = useFamiliarRail({
    enabled: familiarsEnabled,
    activeId: familiarViewId ? familiarForSession(familiarViewId)?.id : undefined,
    sessions: liveSessions,
    unseenReplies: unseenFamiliarReplies,
    onOpen: handlers.familiarView.open,
    onCreate: handlers.familiars.create,
    onDelete: handlers.history.deleteFamiliar,
  });

  return {
    worktreeTabStats: tabStats,
    workspaceSwitchPending: workspaceSwitch.pending?.project === cwd,
    workspaceSwitchError:
      workspaceSwitch.error?.project === cwd ? workspaceSwitch.error.message : undefined,
    explorerRootLabel,
    approvalSessionIds,
    status: historyFailed ? ("error" as const) : ("idle" as const),
    // True from the very first frame that shows a project we have never listed,
    // so the sidebar can stay blank instead of flashing "No sessions yet".
    pending: cwdKey != null && !loadedProjects.has(cwdKey) && !historyFailed,
    selectedDiffPath: activeTab ? selectedChangePath(activeTab, gitCwd) : undefined,
    selectedDiffKind: activeTab ? selectedChangeKind(activeTab) : undefined,
    selectedCommitSha: activeTab ? selectedCommitSha(activeTab) : undefined,
    busyProjectPaths: busyPaths,
    familiars,
    openSessions,
  };
}
