import { useCallback, useRef, useState } from "react";
import {
  confluenceChildrenCached,
  confluencePage,
} from "@/features/confluence/model/api";
import { isConfluenceFolderLike } from "@/features/confluence/model/kinds";
import { confluenceFolderTocMarkdown } from "@/features/confluence/model/prompt";
import type {
  ConfluenceNode,
  ConfluencePage,
  ConfluenceSpace,
} from "@/features/confluence/model/types";
import { errorText } from "./error-text";
import type { SelectedKind, SetError } from "./types";

export type ConfluenceSelectionApi = {
  selectedId: string | null;
  selectedKind: SelectedKind;
  page: ConfluencePage | null;
  folderChildren: ConfluenceNode[];
  loadingPage: boolean;
  selectNode: (node: ConfluenceNode) => Promise<void>;
  reloadSelection: () => Promise<void>;
};

function selectedKindOf(node: ConfluenceNode): SelectedKind {
  if (isConfluenceFolderLike(node)) return "folder";
  if (node.readable) return "page";

  return "other";
}

function folderPlaceholderPage(
  node: ConfluenceNode,
  children: readonly ConfluenceNode[],
): ConfluencePage {
  return {
    id: node.id,
    title: node.title,
    kind: node.kind,
    spaceId: node.spaceId,
    spaceKey: node.spaceKey,
    parentId: node.parentId,
    url: node.url,
    body: confluenceFolderTocMarkdown(node, children),
    readable: false,
    truncated: false,
  };
}

export function useConfluenceSelection(
  activeSpace: ConfluenceSpace | undefined,
  setError: SetError,
): ConfluenceSelectionApi {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<SelectedKind>("page");
  const [page, setPage] = useState<ConfluencePage | null>(null);
  const [folderChildren, setFolderChildren] = useState<ConfluenceNode[]>([]);
  const [loadingPage, setLoadingPage] = useState(false);
  const selectionGeneration = useRef(0);

  const selectNode = useCallback(
    async (node: ConfluenceNode) => {
      const generation = ++selectionGeneration.current;
      const folderLike = isConfluenceFolderLike(node);

      setSelectedId(node.id);
      setError(null);
      setSelectedKind(selectedKindOf(node));
      setLoadingPage(true);
      setPage(null);
      setFolderChildren([]);

      try {
        if (folderLike) {
          const children = await confluenceChildrenCached({
            parentId: node.id,
            spaceId: node.spaceId || undefined,
            spaceKey: node.spaceKey || undefined,
            parentKind: node.kind,
            force: true,
          });
          if (generation !== selectionGeneration.current) return;
          setFolderChildren(children);

          const meta = await confluencePage(node.id).catch(() => null);
          if (generation !== selectionGeneration.current) return;

          setPage(meta ?? folderPlaceholderPage(node, children));
        } else {
          const next = await confluencePage(node.id);
          if (generation !== selectionGeneration.current) return;
          setPage(next);
        }
      } catch (err) {
        if (generation !== selectionGeneration.current) return;
        setError(errorText(err));
      } finally {
        if (generation === selectionGeneration.current) {
          setLoadingPage(false);
        }
      }
    },
    [setError],
  );

  const reloadSelection = useCallback(async () => {
    if (!selectedId) return;

    const generation = ++selectionGeneration.current;
    setLoadingPage(true);

    try {
      if (selectedKind === "folder") {
        const children = await confluenceChildrenCached({
          parentId: selectedId,
          spaceId: activeSpace?.id,
          spaceKey: activeSpace?.key,
          parentKind: "folder",
          force: true,
        });
        if (generation !== selectionGeneration.current) return;
        setFolderChildren(children);

        const meta = await confluencePage(selectedId, {
          force: true,
        }).catch(() => null);
        if (generation !== selectionGeneration.current) return;
        if (meta) setPage(meta);
      } else {
        const next = await confluencePage(selectedId, { force: true });
        if (generation !== selectionGeneration.current) return;
        setPage(next);
      }

      setError(null);
    } catch (err) {
      if (generation !== selectionGeneration.current) return;
      setError(errorText(err));
    } finally {
      if (generation === selectionGeneration.current) {
        setLoadingPage(false);
      }
    }
  }, [activeSpace, selectedId, selectedKind, setError]);

  return {
    selectedId,
    selectedKind,
    page,
    folderChildren,
    loadingPage,
    selectNode,
    reloadSelection,
  };
}
