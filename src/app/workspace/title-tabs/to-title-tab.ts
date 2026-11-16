import { sessionDisplayTitle } from "@/domain/session/title";
import { cachedRemoteSessionSummary, remoteSessionFor } from "@/features/connections/model/connections";
import { isRemoteProjectPath } from "@/features/projects/model/recents";
import { isBlankWorkspaceTab } from "../../model/blank-workspace-tab";
import type { HarnessId } from "@/domain/harness/harness";
import type { Session } from "@/domain/session/session";
import { sessionNeedsInput } from "@/domain/session/session-state";
import { terminalTabLabel } from "@/features/terminal/model/terminal-tab";
import { releaseNotesTitle } from "@/features/updates/model/release-notes";
import { type FilePaneTab, focusedFileTab, isFilesystemTab, isTerminalTab, leafIds, previewWorkspaceFile, type WorkspaceTab } from "@/features/workspace/model/layout";
import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
import { basename, projectName } from "@/shared/lib/paths";
/** A conversation's title, a remote one's as its host names it; blank while new. */
function conversationTitle(session: Session): string {
  const hostId = isRemoteProjectPath(session.cwd)
    ? remoteSessionFor(session.id)
    : undefined;
  const remote = hostId
    ? cachedRemoteSessionSummary(session.cwd, hostId)
    : undefined;
  const title = sessionDisplayTitle(
    remote?.title ?? session.title,
    remote?.harness ?? session.harness,
  );
  return title === "New session" ? "" : title;
}

/** A workspace tab as the title bar shows it. */
export function toTitleTab(
  tab: WorkspaceTab,
  sessions: Session[],
  dirtyFiles: Set<string>,
  unseenFinishedIds: ReadonlySet<string>,
): TitleTab {
  const paneIds = leafIds(tab.layout);
  const multiPane = paneIds.length > 1;
  const tabSessions = paneIds
    .map((id) => sessions.find((session) => session.id === id))
    .filter((session): session is Session => session != null);
  const sessionFocused = tabSessions.some(
    (session) => session.id === tab.focusedId,
  );
  const fileFocused =
    !sessionFocused &&
    (tab.editorPanes.some((pane) => pane.id === tab.focusedId) ||
      (tab.terminalPanes ?? []).some((pane) => pane.id === tab.focusedId));
  const focused =
    sessions.find((session) => session.id === tab.focusedId) ?? tabSessions[0];

  const seen = new Set<HarnessId>();
  const harnesses: HarnessId[] = [];
  const busySeen = new Set<HarnessId>();
  const busyHarnesses: HarnessId[] = [];
  const doneSeen = new Set<HarnessId>();
  const doneHarnesses: HarnessId[] = [];
  const ordered = focused
    ? [focused, ...tabSessions.filter((session) => session.id !== focused.id)]
    : tabSessions;
  for (const session of ordered) {
    if (
      session.busy &&
      !sessionNeedsInput(session) &&
      !busySeen.has(session.harness)
    ) {
      busySeen.add(session.harness);
      busyHarnesses.push(session.harness);
    }
    if (unseenFinishedIds.has(session.id) && !doneSeen.has(session.harness)) {
      doneSeen.add(session.harness);
      doneHarnesses.push(session.harness);
    }
    if (seen.has(session.harness)) continue;
    seen.add(session.harness);
    harnesses.push(session.harness);
  }

  const files: string[] = [];
  const seenKeys = new Set<string>();
  const pushFile = (file: FilePaneTab) => {
    const key = file.terminal
      ? `terminal:${file.id}`
      : file.plan
        ? `plan:${file.plan.blockId}`
        : file.releaseNotes
          ? `release-notes:${file.releaseNotes.version}`
          : file.path;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    files.push(
      file.plan?.title?.trim() ||
        (file.releaseNotes
          ? releaseNotesTitle(file.releaseNotes.version)
          : file.terminal
            ? terminalTabLabel(file)
            : basename(file.path)),
    );
  };
  const focusedPane =
    tab.editorPanes.find((pane) => pane.id === tab.focusedId) ??
    (tab.terminalPanes ?? []).find((pane) => pane.id === tab.focusedId);
  const otherPanes = [
    ...tab.editorPanes.filter((pane) => pane.id !== focusedPane?.id),
    ...(tab.terminalPanes ?? []).filter((pane) => pane.id !== focusedPane?.id),
  ];
  const panes = focusedPane ? [focusedPane, ...otherPanes] : otherPanes;
  for (const pane of panes) {
    const active = pane.files.find((file) => file.id === pane.activeFileId);
    if (active) pushFile(active);
  }
  for (const pane of panes) {
    for (const file of pane.files) pushFile(file);
  }

  const more = tabSessions
    .filter((session) => session.id !== focused?.id)
    .map(conversationTitle)
    .filter(Boolean);

  const hasTerminal = (tab.terminalPanes ?? []).some((pane) =>
    pane.files.some(isTerminalTab),
  );
  const focusedFile = focusedFileTab(tab);

  return {
    id: tab.id,
    project: focused
      ? projectName(focused.cwd)
      : focusedFile
        ? projectName(focusedFile.projectCwd ?? focusedFile.cwd)
        : "~",
    title: focused ? conversationTitle(focused) : "",
    more,
    sessionCount: tabSessions.length,
    harnesses,
    busyHarnesses,
    doneHarnesses,
    files,
    multiPane,
    fileFocused,
    blank: isBlankWorkspaceTab(tab, sessions),
    dirty: tab.editorPanes.some((pane) =>
      pane.files.some(
        (file) => isFilesystemTab(file) && dirtyFiles.has(file.id),
      ),
    ),
    terminal: hasTerminal && harnesses.length === 0,
    previewFileId: previewWorkspaceFile(tab)?.id,
    groupId: tab.groupId,
  };
}
