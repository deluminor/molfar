import type { ComponentProps } from "react";
import { setSplitRatio } from "@/features/workspace/model/layout";
import { PaneTree } from "@/features/workspace/ui/PaneTree";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { useSharedPaneProps } from "./use-shared-pane-props";

type Props = Pick<
  ComponentProps<typeof PaneTree>,
  "sessions" | "composerFocusToken" | "transcriptPool"
> & {
  store: WorkspaceStore;
  workspaceSwitchingSessionId: string | undefined;
  /** The session "Add to chat" targets in the active tab. */
  activeSessionId: string | undefined;
  composerFocused: boolean;
};

/** One pane tree per workspace tab; only the active tab shows, and none behind a Familiar. */
export function WorkspaceTabPanes({
  store,
  workspaceSwitchingSessionId,
  activeSessionId,
  composerFocused,
  ...treeProps
}: Props) {
  const handlers = useWorkspaceHandlers();
  const paneProps = useSharedPaneProps(store, workspaceSwitchingSessionId);
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
            onSelectFile={handlers.files.selectSurface}
            onCloseFile={handlers.tabClose.closeFile}
            onCloseOtherFiles={handlers.tabClose.closeOtherFiles}
            onPinFile={handlers.files.pin}
            onReorderFiles={handlers.tabs.reorderFiles}
            onFileDirtyChange={handlers.files.setDirty}
            onFileErrorCountChange={handlers.files.setErrorCount}
            onUpdatePlan={handlers.queue.updatePlan}
            onMovePane={handlers.tabs.movePane}
            onDetachPane={handlers.tabs.detachPane}
            onTerminalMetaChange={handlers.terminals.changeMeta}
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
