import type { VaultNote } from "../vault/types";
import { MAX_GRAPH_LINKS, MAX_GRAPH_NODES } from "./constants";
import { noteIndex, resolveVaultLink } from "./resolve-links";
import type { KnowledgeGraphProjection } from "./types";

export function projectKnowledgeGraph(
  notes: VaultNote[],
  selectedPath: string | null,
  query: string,
  neighborsOnly = false,
): KnowledgeGraphProjection {
  const index = noteIndex(notes);
  const edges: { source: string; target: string }[] = [];
  const degree = new Map<string, number>();
  const neighborhood = new Set<string>();
  const seen = new Set<string>();
  let missing = 0;
  let ambiguous = 0;
  if (selectedPath) neighborhood.add(selectedPath);

  for (const note of notes) {
    for (const link of note.links) {
      const resolved = resolveVaultLink(index, note.path, link);
      if (resolved.state === "missing") missing += 1;
      if (resolved.state === "ambiguous") ambiguous += 1;
      if (
        resolved.state !== "resolved" ||
        !resolved.path ||
        resolved.path === note.path
      )
        continue;
      const key = JSON.stringify([note.path, resolved.path]);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.path, target: resolved.path });
      degree.set(note.path, (degree.get(note.path) ?? 0) + 1);
      degree.set(resolved.path, (degree.get(resolved.path) ?? 0) + 1);
      if (note.path === selectedPath) neighborhood.add(resolved.path);
      if (resolved.path === selectedPath) neighborhood.add(note.path);
    }
  }

  const needle = query.trim().toLocaleLowerCase();
  const candidates = notes.filter((note) => {
    if (neighborsOnly && selectedPath && !neighborhood.has(note.path))
      return false;
    if (!needle) return true;

    return [note.path, note.title, ...note.aliases, ...note.tags].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    );
  });
  candidates.sort((a, b) => {
    if (a.path === selectedPath) return -1;
    if (b.path === selectedPath) return 1;
    const priority =
      Number(neighborhood.has(b.path)) - Number(neighborhood.has(a.path));

    return (
      priority ||
      (degree.get(b.path) ?? 0) - (degree.get(a.path) ?? 0) ||
      a.path.localeCompare(b.path)
    );
  });
  const nodes = candidates.slice(0, MAX_GRAPH_NODES).map((note) => ({
    id: note.path,
    title: note.title,
    folder: note.path.split("/").slice(0, -1).join("/"),
    degree: degree.get(note.path) ?? 0,
  }));
  const visible = new Set(nodes.map((node) => node.id));
  const links = edges
    .filter((link) => visible.has(link.source) && visible.has(link.target))
    .slice(0, MAX_GRAPH_LINKS);

  return { nodes, links, total: candidates.length, missing, ambiguous };
}
