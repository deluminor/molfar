import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { clearConfluenceCache } from "../../model/confluence/api";
import { saveHiddenConfluenceSpaceIds } from "../../model/confluence/hidden-spaces";
import type { ConfluenceNode } from "../../model/confluence/types";
import { ConfluenceListBody } from "./ConfluenceListBody";
import { ConfluenceListHeader } from "./ConfluenceListHeader";
import { ConfluenceReader } from "./ConfluenceReader";
import { SpaceVisibility } from "./SpaceVisibility";
import { useConfluenceChat } from "./use-confluence-chat";
import { useConfluenceSearch } from "./use-confluence-search";
import { useConfluenceSelection } from "./use-confluence-selection";
import { useConfluenceTree } from "./use-confluence-tree";

type Props = {
  cwd: string;
  sourceTabs: ReactNode;
  toolbar?: ReactNode;
  setListPaneRef: (el: HTMLElement | null) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  resizing?: boolean;
};

export function ConfluenceInboxPanel({
  cwd,
  sourceTabs,
  toolbar,
  setListPaneRef,
  onResizePointerDown,
  onResizeDoubleClick,
  resizing = false,
}: Props): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const tree = useConfluenceTree(setError);
  const search = useConfluenceSearch(tree.activeSpace?.key, setError);
  const selection = useConfluenceSelection(tree.activeSpace, setError);
  const chat = useConfluenceChat({
    activeSpace: tree.activeSpace,
    page: selection.page,
    selectedKind: selection.selectedKind,
    folderChildren: selection.folderChildren,
    setError,
  });

  const { loadSpaces, reloadRoot, resetTree, toggleExpand } = tree;
  const { clearSearch } = search;
  const { reloadSelection, selectNode } = selection;
  const { sendNodeToChat, sendToChat, copyMention } = chat;

  const refreshAll = useCallback(async () => {
    if (refreshing) return;

    setRefreshing(true);
    clearConfluenceCache();
    resetTree();
    clearSearch();

    try {
      await loadSpaces();
      await reloadRoot();
      await reloadSelection();
    } finally {
      setRefreshing(false);
    }
  }, [
    clearSearch,
    loadSpaces,
    refreshing,
    reloadRoot,
    reloadSelection,
    resetTree,
  ]);

  const onSelect = useCallback(
    (node: ConfluenceNode) => void selectNode(node),
    [selectNode],
  );
  const onToggle = useCallback(
    (node: ConfluenceNode) => void toggleExpand(node),
    [toggleExpand],
  );
  const onSend = useCallback(
    (node: ConfluenceNode) => void sendNodeToChat(node),
    [sendNodeToChat],
  );
  const onRefresh = useCallback(() => void refreshAll(), [refreshAll]);
  const onSendToChat = useCallback(() => void sendToChat(), [sendToChat]);
  const onCopyMention = useCallback(() => void copyMention(), [copyMention]);

  return (
    <>
      <div
        ref={setListPaneRef}
        className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-stroke"
      >
        <div className="flex h-9 min-w-0 shrink-0 items-center gap-1 border-b border-stroke px-2">
          {sourceTabs}
        </div>
        {toolbar}
        <ConfluenceListHeader
          searchInput={search.searchInput}
          onSearchInputChange={search.setSearchInput}
          refreshing={refreshing}
          onRefresh={onRefresh}
          visibleSpaces={tree.visibleSpaces}
          activeSpaceId={tree.activeSpace?.id}
          onSpaceChange={tree.setSpaceId}
        />
        {tree.spaces.length > 0 ? (
          <SpaceVisibility
            spaces={tree.spaces}
            hiddenIds={tree.hiddenIds}
            onChange={saveHiddenConfluenceSpaceIds}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-none p-1.5">
          <ConfluenceListBody
            error={error}
            rootState={tree.rootState}
            searchHits={search.searchHits}
            searching={search.searching}
            selectedId={selection.selectedId}
            expanded={tree.expanded}
            tree={tree.tree}
            onSelect={onSelect}
            onToggle={onToggle}
            onSend={onSend}
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Confluence list"
          className={`absolute inset-y-0 -right-px z-10 w-1.5 cursor-col-resize touch-none ${
            resizing ? "bg-content/15" : "hover:bg-content/10"
          }`}
          onPointerDown={onResizePointerDown}
          onDoubleClick={onResizeDoubleClick}
        />
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ConfluenceReader
          cwd={cwd}
          activeSpace={tree.activeSpace}
          selectedId={selection.selectedId}
          selectedKind={selection.selectedKind}
          page={selection.page}
          folderChildren={selection.folderChildren}
          loadingPage={selection.loadingPage}
          error={error}
          sending={chat.sending}
          onSendToChat={onSendToChat}
          onCopyMention={onCopyMention}
        />
      </div>
    </>
  );
}
