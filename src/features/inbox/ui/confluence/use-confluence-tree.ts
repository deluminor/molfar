import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearConfluenceCache,
  confluenceChildrenCached,
  listConfluenceSpaces,
} from "../../model/confluence/api";
import { CONFLUENCE_CHANGE_EVENT } from "../../model/confluence/constants";
import {
  loadHiddenConfluenceSpaceIds,
  visibleConfluenceSpaces,
} from "../../model/confluence/hidden-spaces";
import type {
  ConfluenceNode,
  ConfluenceSpace,
} from "../../model/confluence/types";
import { errorText } from "./error-text";
import type {
  ChildrenQuery,
  ConfluenceTree,
  SetError,
  TreeState,
} from "./types";

export type ConfluenceTreeApi = {
  spaces: ConfluenceSpace[];
  hiddenIds: string[];
  visibleSpaces: ConfluenceSpace[];
  activeSpace: ConfluenceSpace | undefined;
  setSpaceId: (id: string) => void;
  tree: ConfluenceTree;
  rootState: TreeState | undefined;
  expanded: ReadonlySet<string>;
  loadSpaces: () => Promise<void>;
  reloadRoot: () => Promise<void>;
  toggleExpand: (node: ConfluenceNode) => Promise<void>;
  resetTree: () => void;
};

export function useConfluenceTree(setError: SetError): ConfluenceTreeApi {
  const [spaces, setSpaces] = useState<ConfluenceSpace[]>([]);
  const [hiddenIds, setHiddenIds] = useState(loadHiddenConfluenceSpaceIds);
  const [spaceId, setSpaceId] = useState<string>("");
  const [tree, setTree] = useState<ConfluenceTree>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const visibleSpaces = useMemo(
    () => visibleConfluenceSpaces(spaces, hiddenIds),
    [spaces, hiddenIds],
  );

  const activeSpace = useMemo(
    () =>
      visibleSpaces.find((space) => space.id === spaceId) ?? visibleSpaces[0],
    [spaceId, visibleSpaces],
  );

  const resetTree = useCallback(() => {
    setTree({});
    setExpanded(new Set());
  }, []);

  const loadSpaces = useCallback(async () => {
    try {
      const next = await listConfluenceSpaces();
      setSpaces(next);
      setError(null);
    } catch (err) {
      setSpaces([]);
      setError(errorText(err));
    }
  }, [setError]);

  useEffect(() => {
    void loadSpaces();

    const onChange = () => {
      setHiddenIds(loadHiddenConfluenceSpaceIds());
      clearConfluenceCache();
      resetTree();
      void loadSpaces();
    };

    window.addEventListener(CONFLUENCE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONFLUENCE_CHANGE_EVENT, onChange);
  }, [loadSpaces, resetTree]);

  useEffect(() => {
    if (!activeSpace) {
      setSpaceId("");
      return;
    }
    if (spaceId !== activeSpace.id) setSpaceId(activeSpace.id);
  }, [activeSpace, spaceId]);

  const rootKey = activeSpace ? `space:${activeSpace.id}` : "";

  const ensureChildren = useCallback(
    async (key: string, query: ChildrenQuery) => {
      setTree((prev) => ({
        ...prev,
        [key]: {
          loading: true,
          error: null,
          children: prev[key]?.children ?? [],
        },
      }));

      try {
        const children = await confluenceChildrenCached(query);
        setTree((prev) => ({
          ...prev,
          [key]: { loading: false, error: null, children },
        }));
        return children;
      } catch (err) {
        const message = errorText(err);
        setTree((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            error: message,
            children: prev[key]?.children ?? [],
          },
        }));
        return [];
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeSpace) return;
    void ensureChildren(rootKey, {
      spaceId: activeSpace.id,
      spaceKey: activeSpace.key,
    });
  }, [activeSpace, ensureChildren, rootKey]);

  const reloadRoot = useCallback(async () => {
    if (!activeSpace) return;

    await ensureChildren(`space:${activeSpace.id}`, {
      spaceId: activeSpace.id,
      spaceKey: activeSpace.key,
      force: true,
    });
  }, [activeSpace, ensureChildren]);

  const toggleExpand = useCallback(
    async (node: ConfluenceNode) => {
      const expanding = !expanded.has(node.id);

      setExpanded((prev) => {
        const next = new Set(prev);
        if (expanding) next.add(node.id);
        else next.delete(node.id);
        return next;
      });

      if (!expanding) return;

      await ensureChildren(`node:${node.id}`, {
        parentId: node.id,
        spaceId: node.spaceId || activeSpace?.id,
        spaceKey: node.spaceKey || activeSpace?.key,
        parentKind: node.kind,
      });
    },
    [activeSpace?.id, activeSpace?.key, ensureChildren, expanded],
  );

  return {
    spaces,
    hiddenIds,
    visibleSpaces,
    activeSpace,
    setSpaceId,
    tree,
    rootState: tree[rootKey],
    expanded,
    loadSpaces,
    reloadRoot,
    toggleExpand,
    resetTree,
  };
}
