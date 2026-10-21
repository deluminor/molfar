import type { ComponentProps } from "react";
import { setSplitRatio } from "@/features/workspace/model/layout";
import { PaneTree } from "@/features/workspace/ui/PaneTree";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import type { SharedPaneProps } from "./types";

type Props = Pick<
  ComponentProps<typeof PaneTree>,
  | "sessions"
  | "composerFocusToken"
  | "onSelectFile"
  | "onCloseFile"
  | "onCloseOtherFiles"
  | "onPinFile"
  | "onReorderFiles"
  | "onFileDirtyChange"
  | "onFileErrorCountChange"
  | "transcriptPool"
  | "onUpdatePlan"
  | "onMovePane"
  | "onDetachPane"
  | "onTerminalMetaChange"
> & {
  store: WorkspaceStore;
  paneProps: SharedPaneProps;
  /** The session "Add to chat" targets in the active tab. */
  activeSessionId: string | undefined;
  composerFocused: boolean;
};

/** One pane tree per workspace tab; only the active tab shows, and none behind a Familiar. */
export function WorkspaceTabPanes({
  store,
  paneProps,
  activeSessionId,
  composerFocused,
  ...treeProps
}: Props) {
  const tabs = useWorkspaceField(store, "tabs");
  const activeTabId = useWorkspaceField(store, "activeTabId");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const inboxViewOpen = useWorkspaceField(store, "inboxViewOpen");
  const projectTerminalFocused = useWorkspaceField(store, "projectTerminalFocused");
  const dirtyFiles = useWorkspaceField(store, "dirtyFiles");
  const fileErrorCounts = useWorkspaceField(store, "fileErrorCounts");
  const editorNavigation = useWorkspaceField(store, "editorNavigation");
  const { setTabs } = useWorkspaceActions(store);
  const familiarCovers = !!familiarViewId;

  const onRatio = (tabId: string, splitId: string, index: number, ratio: number) =>
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, layout: setSplitRatio(tab.layout, splitId, index, ratio) }
          : tab,
      ),
    );

  return tabs.map((tab) => {
    const active = tab.id === activeTabId;
    const focused =
      active && !familiarViewId && !inboxViewOpen && !tab.diffFocused && !projectTerminalFocused;

    return (
      <div
        key={tab.id}
        data-workspace-tab={tab.id}
        aria-hidden={!active || familiarCovers}
        className={
          active && !familiarCovers ? "absolute inset-0 flex h-full min-h-0 flex-col" : "hidden"
        }
      >
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <PaneTree
            {...paneProps}
            {...treeProps}
            visible={active && !inboxViewOpen && !familiarCovers}
            layout={tab.layout}
            editorPanes={[...tab.editorPanes, ...(tab.terminalPanes ?? [])]}
            dirtyFileIds={dirtyFiles}
            fileErrorCounts={fileErrorCounts}
            focusedId={focused ? tab.focusedId : ""}
            addToChatSessionId={active ? activeSessionId : undefined}
            composerFocused={composerFocused && !projectTerminalFocused && !familiarViewId}
            onRatio={(splitId, index, ratio) => onRatio(tab.id, splitId, index, ratio)}
            editorNavigation={editorNavigation}
          />
        </div>
      </div>
    );
  });
}
