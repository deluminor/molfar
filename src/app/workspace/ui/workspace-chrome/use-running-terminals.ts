import { useMemo } from "react";
import { findProjectTerminal } from "@/features/projects/model/project-terminal";
import { listRunningTerminals, type RunningTerminal } from "@/features/terminal/model/terminal-tab";
import { focusedFileTab, type FilePaneTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type RunningTerminals = {
  terminals: RunningTerminal[];
  /** One of them shows in the open dock or the focused pane. */
  open: boolean;
};

/** Terminals still running in the project's dock and the workspace tabs. */
export function useRunningTerminals(
  store: WorkspaceStore,
  activeTab: WorkspaceTab | undefined,
): RunningTerminals {
  const projectCwd = useWorkspaceField(store, "projectCwd");
  const projectTerminals = useWorkspaceField(store, "projectTerminals");
  const tabs = useWorkspaceField(store, "tabs");
  const dock = findProjectTerminal(projectTerminals, projectCwd);

  const terminals = useMemo(() => {
    const files: FilePaneTab[] = [];
    if (dock) files.push(...dock.pane.files);
    for (const tab of tabs) {
      for (const pane of tab.terminalPanes ?? []) files.push(...pane.files);
    }
    return listRunningTerminals(files);
  }, [dock, tabs]);

  const open = useMemo(() => {
    const ids = new Set(terminals.map((terminal) => terminal.id));
    if (dock?.open && dock.pane.files.some((file) => ids.has(file.id))) return true;
    const focused = activeTab ? focusedFileTab(activeTab) : undefined;
    return !!focused && ids.has(focused.id);
  }, [activeTab, dock, terminals]);

  return { terminals, open };
}
