import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
} from "../../../../shared/ui/icons";
import { buildTree } from "./build-tree";
import type { EntryNode, KnowledgeTreeProps } from "./types";

function TreeNode({
  node,
  selectedPath,
  onSelect,
  searching,
  dirtyPaths,
}: {
  node: EntryNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  searching: boolean;
  dirtyPaths?: ReadonlySet<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (node.entry.isDir && selectedPath?.startsWith(`${node.entry.path}/`)) {
      setExpanded(true);
    }
  }, [node.entry.isDir, node.entry.path, selectedPath]);

  const open = expanded || searching;
  const click = () => {
    if (node.entry.isDir) setExpanded((value) => !value);
    else onSelect(node.entry.path);
  };
  let icon = <File size={14} />;
  if (node.entry.isDir)
    icon = open ? <FolderOpen size={14} /> : <Folder size={14} />;

  return (
    <li>
      <button
        className="knowledge-tree-row"
        aria-current={selectedPath === node.entry.path ? "page" : undefined}
        aria-expanded={node.entry.isDir ? open : undefined}
        onClick={click}
        title={node.entry.path}
        aria-label={
          dirtyPaths?.has(node.entry.path)
            ? `${node.entry.name}, unsaved draft`
            : node.entry.name
        }
      >
        {node.entry.isDir && (
          <ChevronRight
            size={12}
            className={open ? "knowledge-chevron-open" : ""}
          />
        )}
        {icon}
        <span>{node.entry.name}</span>
        {dirtyPaths?.has(node.entry.path) && (
          <span className="knowledge-draft-mark" aria-hidden="true">
            ●
          </span>
        )}
      </button>
      {node.entry.isDir && open && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.entry.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              searching={searching}
              dirtyPaths={dirtyPaths}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function KnowledgeTree({
  entries,
  query,
  selectedPath,
  onSelect,
  dirtyPaths,
}: KnowledgeTreeProps) {
  const nodes = useMemo(() => buildTree(entries, query), [entries, query]);
  return (
    <nav className="knowledge-tree" aria-label="Vault files">
      <ul>
        {nodes.map((node) => (
          <TreeNode
            key={node.entry.path}
            node={node}
            selectedPath={selectedPath}
            onSelect={onSelect}
            searching={Boolean(query)}
            dirtyPaths={dirtyPaths}
          />
        ))}
      </ul>
      {nodes.length === 0 && (
        <p className="knowledge-empty">No matching files.</p>
      )}
    </nav>
  );
}
