import { openUrl } from "@tauri-apps/plugin-opener";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  ExternalLink,
  File,
  Folder,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Wrench,
} from "../../../shared/ui/icons";
import { SecondaryButton } from "../../../shared/ui/SecondaryButton";
import { requestAddToChat } from "../../sessions/model/quoteDraft";
import { AgentMarkdown } from "../../sessions/ui/AgentMarkdown";
import {
  clearConfluenceCache,
  composeConfluenceMessage,
  CONFLUENCE_CHANGE_EVENT,
  confluenceChildrenCached,
  confluenceFolderTocMarkdown,
  confluenceMentionLabel,
  confluencePage,
  isConfluenceFolderLike,
  listConfluenceSpaces,
  loadHiddenConfluenceSpaceIds,
  saveHiddenConfluenceSpaceIds,
  searchConfluence,
  visibleConfluenceSpaces,
  type ConfluenceChatCard,
  type ConfluenceNode,
  type ConfluencePage,
  type ConfluenceSpace,
} from "../model/confluence";

type Props = {
  cwd: string;
  sourceTabs: ReactNode;
  toolbar?: ReactNode;
  setListPaneRef: (el: HTMLElement | null) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  resizing?: boolean;
};

type TreeState = {
  loading: boolean;
  error: string | null;
  children: ConfluenceNode[];
};

export function ConfluenceInboxPanel({
  cwd,
  sourceTabs,
  toolbar,
  setListPaneRef,
  onResizePointerDown,
  onResizeDoubleClick,
  resizing = false,
}: Props) {
  const [spaces, setSpaces] = useState<ConfluenceSpace[]>([]);
  const [hiddenIds, setHiddenIds] = useState(loadHiddenConfluenceSpaceIds);
  const [spaceId, setSpaceId] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchHits, setSearchHits] = useState<ConfluenceNode[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [tree, setTree] = useState<Record<string, TreeState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<"page" | "folder" | "other">(
    "page",
  );
  const [page, setPage] = useState<ConfluencePage | null>(null);
  const [folderChildren, setFolderChildren] = useState<ConfluenceNode[]>([]);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const selectionGeneration = useRef(0);

  const visibleSpaces = useMemo(
    () => visibleConfluenceSpaces(spaces, hiddenIds),
    [spaces, hiddenIds],
  );

  const activeSpace = useMemo(
    () =>
      visibleSpaces.find((space) => space.id === spaceId) ?? visibleSpaces[0],
    [spaceId, visibleSpaces],
  );

  const loadSpaces = useCallback(async () => {
    try {
      const next = await listConfluenceSpaces();
      setSpaces(next);
      setError(null);
    } catch (err) {
      setSpaces([]);
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  useEffect(() => {
    void loadSpaces();

    const onChange = () => {
      setHiddenIds(loadHiddenConfluenceSpaceIds());
      clearConfluenceCache();
      setTree({});
      setExpanded(new Set());
      void loadSpaces();
    };

    window.addEventListener(CONFLUENCE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONFLUENCE_CHANGE_EVENT, onChange);
  }, [loadSpaces]);

  useEffect(() => {
    if (!activeSpace) {
      setSpaceId("");
      return;
    }
    if (spaceId !== activeSpace.id) setSpaceId(activeSpace.id);
  }, [activeSpace, spaceId]);

  const rootKey = activeSpace ? `space:${activeSpace.id}` : "";

  const ensureChildren = useCallback(
    async (
      key: string,
      query: {
        spaceId?: string;
        parentId?: string;
        spaceKey?: string;
        parentKind?: string;
        force?: boolean;
      },
    ) => {
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
        const message = String(err instanceof Error ? err.message : err);
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

  const refreshAll = useCallback(async () => {
    if (refreshing) return;

    setRefreshing(true);
    clearConfluenceCache();
    setTree({});
    setExpanded(new Set());
    setSearchHits(null);

    try {
      await loadSpaces();

      if (activeSpace) {
        await ensureChildren(`space:${activeSpace.id}`, {
          spaceId: activeSpace.id,
          spaceKey: activeSpace.key,
          force: true,
        });
      }

      if (selectedId) {
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
          setError(String(err instanceof Error ? err.message : err));
        } finally {
          if (generation === selectionGeneration.current) {
            setLoadingPage(false);
          }
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [
    activeSpace,
    ensureChildren,
    loadSpaces,
    refreshing,
    selectedId,
    selectedKind,
  ]);

  useEffect(() => {
    const query = searchInput.trim();
    if (!query) {
      setSearchHits(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const handle = window.setTimeout(() => {
      void searchConfluence({
        query,
        spaceKey: activeSpace?.key,
        limit: 30,
      })
        .then((hits) => {
          if (!cancelled) setSearchHits(hits);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setSearchHits([]);
            setError(String(err instanceof Error ? err.message : err));
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [activeSpace?.key, searchInput]);

  const selectNode = useCallback(async (node: ConfluenceNode) => {
    const generation = ++selectionGeneration.current;
    const folderLike = isConfluenceFolderLike(node);

    setSelectedId(node.id);
    setError(null);
    setSelectedKind(folderLike ? "folder" : node.readable ? "page" : "other");
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

        setPage(
          meta ?? {
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
          },
        );
      } else {
        const next = await confluencePage(node.id);
        if (generation !== selectionGeneration.current) return;
        setPage(next);
      }
    } catch (err) {
      if (generation !== selectionGeneration.current) return;
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      if (generation === selectionGeneration.current) {
        setLoadingPage(false);
      }
    }
  }, []);

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

  const sendNodeToChat = useCallback(
    async (node: ConfluenceNode) => {
      if (sending) return;
      setSending(true);

      try {
        if (isConfluenceFolderLike(node)) {
          const children = await confluenceChildrenCached({
            parentId: node.id,
            spaceId: node.spaceId || activeSpace?.id,
            spaceKey: node.spaceKey || activeSpace?.key,
            parentKind: node.kind,
          });

          const card: ConfluenceChatCard = {
            kind: "folder",
            id: node.id,
            title: node.title,
            url: node.url,
            body: confluenceFolderTocMarkdown(node, children),
          };
          requestAddToChat(composeConfluenceMessage(card, ""), "plain");
          return;
        }

        const next = await confluencePage(node.id);
        const card: ConfluenceChatCard = {
          kind: "page",
          id: next.id,
          title: next.title,
          url: next.url,
          body: next.body,
        };
        requestAddToChat(composeConfluenceMessage(card, ""), "plain");
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      } finally {
        setSending(false);
      }
    },
    [activeSpace?.id, activeSpace?.key, sending],
  );

  const sendToChat = useCallback(async () => {
    if (!page || sending) return;
    setSending(true);

    try {
      let body = page.body;
      let kind: ConfluenceChatCard["kind"] = "page";

      if (selectedKind === "folder") {
        kind = "folder";
        body = confluenceFolderTocMarkdown(
          { title: page.title, url: page.url, id: page.id },
          folderChildren,
        );
      }

      const card: ConfluenceChatCard = {
        kind,
        id: page.id,
        title: page.title,
        url: page.url,
        body,
      };
      requestAddToChat(composeConfluenceMessage(card, ""), "plain");
    } finally {
      setSending(false);
    }
  }, [folderChildren, page, selectedKind, sending]);

  const copyMention = useCallback(async () => {
    if (!page) return;

    const kind = selectedKind === "folder" ? "folder" : "page";
    const label = confluenceMentionLabel({
      kind,
      id: page.id,
      title: page.title,
      url: page.url,
    });

    try {
      await navigator.clipboard.writeText(label);
    } catch {
      // clipboard may be denied
    }
  }, [page, selectedKind]);

  const rootState = tree[rootKey];
  const showingSearch = searchHits !== null;

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
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
          <div className="relative flex h-7 min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-2 size-3 shrink-0 opacity-50" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search Confluence"
              aria-label="Search Confluence"
              spellCheck={false}
              autoComplete="off"
              className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/40"
            />
          </div>
          <button
            type="button"
            title="Refresh Confluence"
            aria-label="Refresh Confluence"
            disabled={refreshing}
            onClick={() => void refreshAll()}
            className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content disabled:opacity-40"
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
          </button>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stroke px-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-content/50">
            <span className="shrink-0">Space</span>
            <select
              aria-label="Confluence space"
              value={activeSpace?.id ?? ""}
              onChange={(event) => setSpaceId(event.target.value)}
              className="h-7 min-w-0 flex-1 rounded-md border border-content/10 bg-transparent px-2 text-[12px] text-content outline-none"
            >
              {visibleSpaces.length === 0 ? (
                <option value="">No spaces</option>
              ) : (
                visibleSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} ({space.key})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
        {spaces.length > 0 ? (
          <SpaceVisibility
            spaces={spaces}
            hiddenIds={hiddenIds}
            onChange={saveHiddenConfluenceSpaceIds}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-none p-1.5">
          {error && !rootState?.children.length && !showingSearch ? (
            <p className="px-2 py-2 text-[12px] text-content/50">{error}</p>
          ) : showingSearch ? (
            searching ? (
              <div className="flex justify-center py-8 text-content/40">
                <LoaderCircle
                  className="size-4 animate-spin"
                  strokeWidth={1.75}
                />
              </div>
            ) : searchHits && searchHits.length === 0 ? (
              <p className="px-2 py-2 text-[12px] text-content/50">
                No matching pages
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {(searchHits ?? []).map((node) => (
                  <li key={`search:${node.id}`}>
                    <TreeRow
                      node={node}
                      depth={0}
                      selected={selectedId === node.id}
                      expanded={false}
                      expandable={false}
                      onSelect={() => void selectNode(node)}
                      onSend={() => void sendNodeToChat(node)}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : rootState?.loading && !rootState.children.length ? (
            <div className="flex justify-center py-8 text-content/40">
              <LoaderCircle
                className="size-4 animate-spin"
                strokeWidth={1.75}
              />
            </div>
          ) : rootState?.error && rootState.children.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-content/50">
              {rootState.error}
            </p>
          ) : (rootState?.children.length ?? 0) === 0 ? (
            <p className="px-2 py-2 text-[12px] text-content/50">
              This space has no pages yet
            </p>
          ) : (
            <TreeList
              nodes={rootState?.children ?? []}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              tree={tree}
              onSelect={(node) => void selectNode(node)}
              onToggle={(node) => void toggleExpand(node)}
              onSend={(node) => void sendNodeToChat(node)}
            />
          )}
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
        {!selectedId ? (
          <div className="grid flex-1 place-items-center px-6">
            <p className="text-[13px] text-content/45">
              Select a Confluence page or folder
            </p>
          </div>
        ) : loadingPage && !page ? (
          <div className="grid flex-1 place-items-center text-content/40">
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
          </div>
        ) : page ? (
          <>
            <div
              className="flex shrink-0 flex-col gap-2 border-b border-stroke px-4 py-3"
              data-inbox-detail-header
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-content/40">
                    {selectedKind === "folder"
                      ? "Folder"
                      : page.kind === "page"
                        ? "Page"
                        : page.kind}
                    {activeSpace ? ` · ${activeSpace.key}` : ""}
                  </p>
                  <h2 className="mt-1 text-[15px] font-medium leading-snug text-content">
                    {page.title}
                  </h2>
                </div>
                <button
                  type="button"
                  title="Open in Confluence"
                  aria-label="Open in Confluence"
                  onClick={() => void openUrl(page.url)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SecondaryButton
                  type="button"
                  disabled={sending}
                  onClick={() => void sendToChat()}
                >
                  {sending ? "Sending…" : "Send to chat"}
                </SecondaryButton>
                <button
                  type="button"
                  onClick={() => void copyMention()}
                  className="h-7 rounded-md px-2 text-[12px] text-content/55 hover:bg-content/8 hover:text-content"
                >
                  Copy @mention
                </button>
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-none px-4 py-4"
              data-inbox-detail-scroll
            >
              {selectedKind === "folder" ? (
                <div className="space-y-3">
                  <p className="text-[12px] text-content/50">
                    Folders pass a table of contents to the agent. Individual
                    pages include full markdown.
                  </p>
                  <AgentMarkdown
                    text={confluenceFolderTocMarkdown(
                      { title: page.title, url: page.url, id: page.id },
                      folderChildren,
                    )}
                    cwd={cwd}
                  />
                </div>
              ) : (
                <AgentMarkdown text={page.body} cwd={cwd} />
              )}
              {page.truncated ? (
                <p className="mt-4 text-[12px] text-content/45">
                  Body truncated for size. Open in Confluence for the full page.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="grid flex-1 place-items-center px-6">
            <p className="text-[13px] text-content/45">
              {error ?? "Could not load this page"}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function SpaceVisibility({
  spaces,
  hiddenIds,
  onChange,
}: {
  spaces: readonly ConfluenceSpace[];
  hiddenIds: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-b border-stroke px-3 py-1.5 text-left text-[11px] text-content/40 hover:text-content/70"
      >
        {hiddenIds.length > 0
          ? `${hiddenIds.length} space${hiddenIds.length === 1 ? "" : "s"} hidden · manage`
          : "Manage visible spaces"}
      </button>
    );
  }

  const hidden = new Set(hiddenIds);

  return (
    <div className="max-h-36 overflow-y-auto border-b border-stroke px-2 py-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] text-content/45">Visible spaces</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-content/45 hover:text-content"
        >
          Done
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {spaces.map((space) => {
          const checked = !hidden.has(space.id);
          return (
            <li key={space.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-content/5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(hidden);
                    if (checked) next.add(space.id);
                    else next.delete(space.id);
                    onChange([...next]);
                  }}
                />
                <span className="min-w-0 truncate text-content/80">
                  {space.name}
                </span>
                <span className="shrink-0 text-content/35">{space.key}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TreeList({
  nodes,
  depth,
  selectedId,
  expanded,
  tree,
  onSelect,
  onToggle,
  onSend,
}: {
  nodes: readonly ConfluenceNode[];
  depth: number;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  tree: Record<string, TreeState>;
  onSelect: (node: ConfluenceNode) => void;
  onToggle: (node: ConfluenceNode) => void;
  onSend: (node: ConfluenceNode) => void;
}) {
  return (
    <ul className="flex flex-col gap-px">
      {nodes.map((node) => {
        const isExpanded = expanded.has(node.id);
        const childState = tree[`node:${node.id}`];
        const expandable = node.hasChildren || node.kind === "folder";
        return (
          <li key={node.id}>
            <TreeRow
              node={node}
              depth={depth}
              selected={selectedId === node.id}
              expanded={isExpanded}
              expandable={expandable}
              onSelect={() => onSelect(node)}
              onToggle={expandable ? () => onToggle(node) : undefined}
              onSend={() => onSend(node)}
            />
            {isExpanded ? (
              <div className="mt-px">
                {childState?.loading && !childState.children.length ? (
                  <div
                    className="flex items-center gap-2 py-1 text-[11px] text-content/40"
                    style={{ paddingLeft: 12 + (depth + 1) * 12 }}
                  >
                    <LoaderCircle
                      className="size-3 animate-spin"
                      strokeWidth={1.75}
                    />
                    Loading…
                  </div>
                ) : childState?.error && childState.children.length === 0 ? (
                  <p
                    className="py-1 text-[11px] text-content/45"
                    style={{ paddingLeft: 12 + (depth + 1) * 12 }}
                  >
                    {childState.error}
                  </p>
                ) : (childState?.children.length ?? 0) === 0 ? (
                  <p
                    className="py-1 text-[11px] text-content/35"
                    style={{ paddingLeft: 12 + (depth + 1) * 12 }}
                  >
                    Empty
                  </p>
                ) : (
                  <TreeList
                    nodes={childState?.children ?? []}
                    depth={depth + 1}
                    selectedId={selectedId}
                    expanded={expanded}
                    tree={tree}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    onSend={onSend}
                  />
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TreeRow({
  node,
  depth,
  selected,
  expanded,
  expandable,
  onSelect,
  onToggle,
  onSend,
}: {
  node: ConfluenceNode;
  depth: number;
  selected: boolean;
  expanded: boolean;
  expandable: boolean;
  onSelect: () => void;
  onToggle?: () => void;
  onSend?: () => void;
}) {
  const folderLike = node.kind === "folder";
  const toolLike =
    node.kind === "whiteboard" ||
    node.kind === "database" ||
    node.kind === "embed";

  return (
    <div
      className={`group flex min-w-0 items-center gap-0.5 rounded-md ${
        selected ? "bg-selection text-content" : "hover:bg-content/5"
      }`}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
          className="grid size-6 shrink-0 place-items-center rounded text-content/45 hover:text-content"
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            strokeWidth={1.75}
          />
        </button>
      ) : (
        <span className="grid size-6 shrink-0 place-items-center text-[10px] text-content/30">
          •
        </span>
      )}
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left"
      >
        {folderLike ? (
          <Folder
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
        ) : toolLike ? (
          <Wrench
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
        ) : (
          <File
            className="size-3.5 shrink-0 text-content/45"
            strokeWidth={1.75}
          />
        )}
        <span className="min-w-0 truncate text-[12px] leading-tight">
          {node.title}
        </span>
      </button>
      {onSend ? (
        <button
          type="button"
          title="Send to chat"
          aria-label={`Send ${node.title} to chat`}
          onClick={(event) => {
            event.stopPropagation();
            onSend();
          }}
          className="mr-0.5 grid size-6 shrink-0 place-items-center rounded text-content/40 opacity-0 hover:bg-content/10 hover:text-content group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
