import type { ReactNode } from "react";
import { LoaderCircle } from "@/shared/ui/icons";
import type { ConfluenceNode } from "@/features/confluence/model/types";
import { TreeList } from "./TreeList";
import { TreeRow } from "./TreeRow";
import type { ConfluenceTree, TreeState } from "./types";

type Props = {
  error: string | null;
  rootState: TreeState | undefined;
  searchHits: ConfluenceNode[] | null;
  searching: boolean;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  tree: ConfluenceTree;
  onSelect: (node: ConfluenceNode) => void;
  onToggle: (node: ConfluenceNode) => void;
  onSend: (node: ConfluenceNode) => void;
};

function Message({ children }: { children: ReactNode }): ReactNode {
  return <p className="px-2 py-2 text-[12px] text-content/50">{children}</p>;
}

function Loading(): ReactNode {
  return (
    <div className="flex justify-center py-8 text-content/40">
      <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} />
    </div>
  );
}

function SearchResults({
  hits,
  searching,
  selectedId,
  onSelect,
  onSend,
}: {
  hits: readonly ConfluenceNode[];
  searching: boolean;
  selectedId: string | null;
  onSelect: (node: ConfluenceNode) => void;
  onSend: (node: ConfluenceNode) => void;
}): ReactNode {
  if (searching) return <Loading />;
  if (hits.length === 0) return <Message>No matching pages</Message>;

  return (
    <ul className="flex flex-col gap-0.5">
      {hits.map((node) => (
        <li key={`search:${node.id}`}>
          <TreeRow
            node={node}
            depth={0}
            selected={selectedId === node.id}
            expanded={false}
            expandable={false}
            onSelect={() => onSelect(node)}
            onSend={() => onSend(node)}
          />
        </li>
      ))}
    </ul>
  );
}

export function ConfluenceListBody({
  error,
  rootState,
  searchHits,
  searching,
  selectedId,
  expanded,
  tree,
  onSelect,
  onToggle,
  onSend,
}: Props): ReactNode {
  const rootChildren = rootState?.children ?? [];

  if (error && rootChildren.length === 0 && searchHits === null) {
    return <Message>{error}</Message>;
  }

  if (searchHits !== null) {
    return (
      <SearchResults
        hits={searchHits}
        searching={searching}
        selectedId={selectedId}
        onSelect={onSelect}
        onSend={onSend}
      />
    );
  }

  if (rootState?.loading && rootChildren.length === 0) return <Loading />;

  if (rootState?.error && rootChildren.length === 0) {
    return <Message>{rootState.error}</Message>;
  }

  if (rootChildren.length === 0) {
    return <Message>This space has no pages yet</Message>;
  }

  return (
    <TreeList
      nodes={rootChildren}
      depth={0}
      selectedId={selectedId}
      expanded={expanded}
      tree={tree}
      onSelect={onSelect}
      onToggle={onToggle}
      onSend={onSend}
    />
  );
}
