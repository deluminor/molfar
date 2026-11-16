import { invoke } from "@tauri-apps/api/core";
import { normalizeConfluenceKind } from "./kinds";
import type { ConfluenceNode, ConfluencePage, ConfluenceSpace } from "./types";

const pageCache = new Map<string, ConfluencePage>();
const childrenCache = new Map<string, ConfluenceNode[]>();
let cacheGeneration = 0;

export function clearConfluenceCache(): void {
  cacheGeneration += 1;
  pageCache.clear();
  childrenCache.clear();
}

function normalizeNode(node: ConfluenceNode): ConfluenceNode {
  return { ...node, kind: normalizeConfluenceKind(node.kind) };
}

function normalizePage(page: ConfluencePage): ConfluencePage {
  return { ...page, kind: normalizeConfluenceKind(page.kind) };
}

export function listConfluenceSpaces(): Promise<ConfluenceSpace[]> {
  return invoke<ConfluenceSpace[]>("confluence_list_spaces");
}

export async function listConfluenceChildren(query: {
  spaceId?: string;
  parentId?: string;
  spaceKey?: string;
  parentKind?: string;
}): Promise<ConfluenceNode[]> {
  const nodes = await invoke<ConfluenceNode[]>("confluence_list_children", {
    spaceId: query.spaceId ?? null,
    parentId: query.parentId ?? null,
    spaceKey: query.spaceKey ?? null,
    parentKind: query.parentKind ?? null,
  });

  return nodes.map(normalizeNode);
}

export async function searchConfluence(query: {
  query: string;
  spaceKey?: string;
  limit?: number;
}): Promise<ConfluenceNode[]> {
  const nodes = await invoke<ConfluenceNode[]>("confluence_search", {
    query: query.query,
    spaceKey: query.spaceKey ?? null,
    limit: query.limit ?? null,
  });

  return nodes.map(normalizeNode);
}

export async function confluencePage(
  id: string,
  options?: { force?: boolean },
): Promise<ConfluencePage> {
  if (!options?.force) {
    const cached = pageCache.get(id);
    if (cached) return cached;
  }

  const generation = cacheGeneration;
  const page = normalizePage(
    await invoke<ConfluencePage>("confluence_page", { id }),
  );

  if (generation === cacheGeneration) pageCache.set(id, page);
  return page;
}

export async function confluenceChildrenCached(query: {
  spaceId?: string;
  parentId?: string;
  spaceKey?: string;
  parentKind?: string;
  force?: boolean;
}): Promise<ConfluenceNode[]> {
  const key = [
    query.spaceId ?? "",
    query.parentId ?? "",
    query.spaceKey ?? "",
    query.parentKind ?? "",
  ].join(":");

  if (!query.force) {
    const cached = childrenCache.get(key);
    if (cached) return cached;
  }

  const generation = cacheGeneration;
  const nodes = await listConfluenceChildren(query);

  if (generation === cacheGeneration) childrenCache.set(key, nodes);
  return nodes;
}
