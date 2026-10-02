import type { ReactNode } from "react";
import { LoaderCircle } from "../../../../shared/ui/icons";
import type { ConfluenceNode } from "../../model/confluence/types";
import { TreeRow } from "./TreeRow";
import type { ConfluenceTree, TreeState } from "./types";

type Props = {
  nodes: readonly ConfluenceNode[];
  depth: number;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  tree: ConfluenceTree;
  onSelect: (node: ConfluenceNode) => void;
  onToggle: (node: ConfluenceNode) => void;
  onSend: (node: ConfluenceNode) => void;
};

type ChildrenProps = Omit<Props, "nodes"> & {
  state: TreeState | undefined;
};

function NodeChildren({ state, depth, ...tree }: ChildrenProps): ReactNode {
  const indent = { paddingLeft: 12 + (depth + 1) * 12 };
  const children = state?.children ?? [];

  if (state?.loading && children.length === 0) {
    return (
      <div
        className="flex items-center gap-2 py-1 text-[11px] text-content/40"
        style={indent}
      >
        <LoaderCircle className="size-3 animate-spin" strokeWidth={1.75} />
        Loading…
      </div>
    );
  }

  if (state?.error && children.length === 0) {
    return (
      <p className="py-1 text-[11px] text-content/45" style={indent}>
        {state.error}
      </p>
    );
  }

  if (children.length === 0) {
    return (
      <p className="py-1 text-[11px] text-content/35" style={indent}>
        Empty
      </p>
    );
  }

  return <TreeList nodes={children} depth={depth + 1} {...tree} />;
}

export function TreeList({
  nodes,
  depth,
  selectedId,
  expanded,
  tree,
  onSelect,
  onToggle,
  onSend,
}: Props): ReactNode {
  return (
    <ul className="flex flex-col gap-px">
      {nodes.map((node) => {
        const isExpanded = expanded.has(node.id);
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
                <NodeChildren
                  state={tree[`node:${node.id}`]}
                  depth={depth}
                  selectedId={selectedId}
                  expanded={expanded}
                  tree={tree}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  onSend={onSend}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
