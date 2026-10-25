import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { remoteTabCwd } from "@/features/connections/model/connections";
import {
  remotePath,
  remoteProjectFor,
  remoteSessionGitCwd,
} from "@/features/connections/model/remote-projects";
import { isRemoteProjectPath, looksLikeProject } from "@/features/projects/model/recents";
import { newTerminalCwd } from "@/features/terminal/model/terminal-tab";
import type { FilePaneTab } from "@/features/workspace/model/layout";

export type WorkspaceCwds = {
  /** The project the sidebar, title bar and history show. */
  sidebarCwd: string;
  /** The focused file's folder or the chat's work path. */
  gitCwd: string;
  terminalCwd: string;
  /** Where Go to File and the Explorer list files (remote-aware). */
  filesCwd: string;
  /** Where git runs (remote-aware). */
  gitRootCwd: string;
  /** The project an inset space scopes its app views to. */
  appViewScope: string | undefined;
};

/** The folders the workspace follows for the focused file or chat. */
export function workspaceCwds({
  activeFile,
  active,
  projectCwd,
  insetLayout,
}: {
  activeFile: FilePaneTab | undefined;
  active: Session | undefined;
  projectCwd: string;
  insetLayout: boolean;
}): WorkspaceCwds {
  // A Familiar belongs to no project, so its view keeps the project in place.
  const sidebarCwd =
    activeFile?.projectCwd ?? activeFile?.cwd ?? active?.cwd ?? projectCwd;
  // Each inset space is one project, so its Inbox, Notes and Automations (and
  // the Inbox dot) show that project's items; the classic layout shows all.
  const appViewScope =
    insetLayout && looksLikeProject(sidebarCwd) ? sidebarCwd : undefined;
  const gitCwd =
    activeFile?.cwd ?? (active ? sessionWorkCwd(active) : sidebarCwd);
  const terminalCwd = newTerminalCwd({
    activeFile,
    session: active,
    fallback: sidebarCwd,
  });
  const remoteFilesProject = remoteProjectFor(sidebarCwd);
  if (!remoteFilesProject) {
    return { sidebarCwd, gitCwd, terminalCwd, filesCwd: gitCwd, gitRootCwd: gitCwd, appViewScope };
  }

  // The host checkout the remote tab is aimed at — the attached session's
  // work path or a worktree picked before the first message.
  const remoteTabCheckout = remoteTabCwd(sidebarCwd, active?.id);
  const filesCwd = isRemoteProjectPath(gitCwd)
    ? gitCwd
    : remotePath(
        remoteFilesProject.environmentId,
        remoteTabCheckout ??
          (gitCwd && gitCwd !== sidebarCwd ? gitCwd : remoteFilesProject.cwd),
      );
  // Git follows the session's own work path (a linked worktree included),
  // never the terminal-following files cwd: a remote session working in a
  // separate worktree diffed the main checkout and showed "No file changes".
  const gitRootCwd = remoteSessionGitCwd(
    remoteFilesProject,
    gitCwd,
    sidebarCwd,
    remoteTabCheckout,
  );

  return { sidebarCwd, gitCwd, terminalCwd, filesCwd, gitRootCwd, appViewScope };
}
