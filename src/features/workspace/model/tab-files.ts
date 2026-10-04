import type { WorkspaceTab, FilePaneTab } from "./layout";

export function filesInWorkspaceTabs(
  tabs: readonly WorkspaceTab[],
): FilePaneTab[] {
  return tabs.flatMap((tab) => [
    ...tab.editorPanes.flatMap((pane) => pane.files),
    ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
  ]);
}
