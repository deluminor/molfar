import type { VaultEntry } from "../../model/vault/types";
import type { EntryNode } from "./types";
export function buildTree(entries: VaultEntry[], query: string): EntryNode[] {
  const included = new Set<string>();
  for (const entry of entries) {
    if (!query || entry.path.toLowerCase().includes(query.toLowerCase())) {
      const segments = entry.path.split("/");
      for (let length = 1; length <= segments.length; length += 1)
        included.add(segments.slice(0, length).join("/"));
    }
  }
  const nodes = new Map<string, EntryNode>();
  for (const entry of entries)
    if (included.has(entry.path))
      nodes.set(entry.path, { entry, children: [] });
  const roots: EntryNode[] = [];
  for (const node of nodes.values()) {
    const separator = node.entry.path.lastIndexOf("/");
    const parentPath = separator < 0 ? "" : node.entry.path.slice(0, separator);
    const parent = nodes.get(parentPath);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: EntryNode[]) => {
    list.sort(
      (a, b) =>
        Number(b.entry.isDir) - Number(a.entry.isDir) ||
        a.entry.name.localeCompare(b.entry.name),
    );
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}
