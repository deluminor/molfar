import type { ConfluenceKind, ConfluenceNode } from "./types";

const CONFLUENCE_KINDS = new Set<string>([
  "page",
  "folder",
  "whiteboard",
  "database",
  "embed",
  "blogpost",
  "other",
]);

function isConfluenceKind(value: string): value is ConfluenceKind {
  return CONFLUENCE_KINDS.has(value);
}

export function isConfluenceFolderLike(
  node: Pick<ConfluenceNode, "kind" | "readable" | "hasChildren">,
): boolean {
  return node.kind === "folder" || (!node.readable && node.hasChildren);
}

export function normalizeConfluenceKind(raw: string): ConfluenceKind {
  return isConfluenceKind(raw) ? raw : "other";
}
