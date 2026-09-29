import { invoke } from "@tauri-apps/api/core";

export type ConfluenceStatus = {
  connected: boolean;
  site: string;
  email: string;
};

export type ConfluenceSpace = {
  id: string;
  key: string;
  name: string;
};

export type ConfluenceKind =
  | "page"
  | "folder"
  | "whiteboard"
  | "database"
  | "embed"
  | "blogpost"
  | "other";

export type ConfluenceNode = {
  id: string;
  title: string;
  kind: ConfluenceKind;
  spaceId: string;
  spaceKey: string;
  parentId: string;
  url: string;
  hasChildren: boolean;
  readable: boolean;
};

export type ConfluencePage = {
  id: string;
  title: string;
  kind: ConfluenceKind;
  spaceId: string;
  spaceKey: string;
  parentId: string;
  url: string;
  body: string;
  readable: boolean;
  truncated: boolean;
};

export type ConfluenceMentionKind = "page" | "folder";

export type ConfluenceMentionRef = {
  kind: ConfluenceMentionKind;
  id: string;
  title: string;
  url: string;
  spaceKey?: string;
};

const HIDDEN_SPACES_KEY = "monocode.confluenceHiddenSpaces";
export const CONFLUENCE_CHANGE_EVENT = "monocode:confluence-change";

const PAGE_MENTION_RE = /(^|\s)@confluence\/page\/([A-Za-z0-9_-]+)/g;
const FOLDER_MENTION_RE = /(^|\s)@confluence\/folder\/([A-Za-z0-9_-]+)/g;

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

const pageCache = new Map<string, ConfluencePage>();
const childrenCache = new Map<string, ConfluenceNode[]>();
let cacheGeneration = 0;

export function clearConfluenceCache(): void {
  cacheGeneration += 1;
  pageCache.clear();
  childrenCache.clear();
}

export function isConfluenceFolderLike(
  node: Pick<ConfluenceNode, "kind" | "readable" | "hasChildren">,
): boolean {
  return node.kind === "folder" || (!node.readable && node.hasChildren);
}

export function normalizeConfluenceKind(raw: string): ConfluenceKind {
  return isConfluenceKind(raw) ? raw : "other";
}

function normalizeNode(node: ConfluenceNode): ConfluenceNode {
  return { ...node, kind: normalizeConfluenceKind(node.kind) };
}

function normalizePage(page: ConfluencePage): ConfluencePage {
  return { ...page, kind: normalizeConfluenceKind(page.kind) };
}

export function confluenceConnected(): Promise<ConfluenceStatus> {
  return invoke<ConfluenceStatus>("confluence_status");
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

export function peekConfluencePage(id: string): ConfluencePage | null {
  return pageCache.get(id) ?? null;
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

export function loadHiddenConfluenceSpaceIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_SPACES_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  } catch (error) {
    console.error("Failed to read Confluence hidden spaces:", error);
    return [];
  }
}

export function saveHiddenConfluenceSpaceIds(ids: string[]): void {
  try {
    localStorage.setItem(HIDDEN_SPACES_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error("Failed to save Confluence hidden spaces:", error);
  }

  notifyConfluenceChange();
}

export function notifyConfluenceChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONFLUENCE_CHANGE_EVENT));
}

export function confluenceMentionLabel(ref: ConfluenceMentionRef): string {
  return `@confluence/${ref.kind}/${ref.id}`;
}

export function confluenceMentionPath(ref: ConfluenceMentionRef): string {
  return `confluence://${ref.kind}/${ref.id}`;
}

export function isConfluenceMentionPath(path: string): boolean {
  return path.startsWith("confluence://");
}

export function parseConfluenceMentionPath(
  path: string,
): { kind: ConfluenceMentionKind; id: string } | null {
  const match = /^confluence:\/\/(page|folder)\/([A-Za-z0-9_-]+)$/.exec(path);
  if (!match) return null;

  return {
    kind: match[1] as ConfluenceMentionKind,
    id: match[2]!,
  };
}

export function confluenceIdsInText(text: string): {
  pages: string[];
  folders: string[];
} {
  const pages: string[] = [];
  const folders: string[] = [];
  const seenPages = new Set<string>();
  const seenFolders = new Set<string>();

  PAGE_MENTION_RE.lastIndex = 0;
  FOLDER_MENTION_RE.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = PAGE_MENTION_RE.exec(text))) {
    const id = match[2];
    if (!id || seenPages.has(id)) continue;
    seenPages.add(id);
    pages.push(id);
  }

  while ((match = FOLDER_MENTION_RE.exec(text))) {
    const id = match[2];
    if (!id || seenFolders.has(id)) continue;
    seenFolders.add(id);
    folders.push(id);
  }

  return { pages, folders };
}

export function confluenceFolderTocMarkdown(
  folder: { title: string; url: string; id: string },
  children: readonly ConfluenceNode[],
): string {
  const lines = [
    `Confluence folder "${folder.title}" (${folder.url}):`,
    "",
    "Table of contents (fetch bodies with confluence.read when needed):",
  ];

  if (children.length === 0) {
    lines.push("- (empty)");
  } else {
    for (const child of children) {
      const marker =
        child.kind === "folder" || child.hasChildren ? "folder" : "page";
      lines.push(
        `- [${marker}] ${child.title} — id=${child.id} — ${child.url}`,
      );
    }
  }

  return lines.join("\n");
}

export function injectConfluencePrompt(
  text: string,
  blocks: readonly { title: string; body: string }[],
): string {
  if (blocks.length === 0) return text;

  const rendered = blocks.map((block) => {
    const heading = block.title.trim() || "Untitled";
    return [`Referenced Confluence "${heading}":`, "", block.body.trim()].join(
      "\n",
    );
  });

  return [text.trimEnd(), "", "---", ...rendered].join("\n");
}

async function loadPageBlock(
  id: string,
): Promise<{ title: string; body: string }> {
  try {
    const page = await confluencePage(id);
    return { title: page.title, body: page.body };
  } catch (error) {
    console.error("Failed to load Confluence page for prompt:", { id, error });
    return {
      title: id,
      body: `_Could not load Confluence page ${id}._`,
    };
  }
}

async function loadFolderBlock(
  id: string,
): Promise<{ title: string; body: string }> {
  try {
    const page = await confluencePage(id);
    const children = await listConfluenceChildren({
      parentId: id,
      spaceId: page.spaceId || undefined,
      spaceKey: page.spaceKey || undefined,
      parentKind: "folder",
    });

    return {
      title: page.title,
      body: confluenceFolderTocMarkdown(
        { title: page.title, url: page.url, id: page.id },
        children,
      ),
    };
  } catch (error) {
    console.error("Failed to load Confluence folder for prompt:", {
      id,
      error,
    });
    return {
      title: id,
      body: `_Could not load Confluence folder ${id}._`,
    };
  }
}

export async function applyConfluenceToTurn(text: string): Promise<string> {
  const { pages, folders } = confluenceIdsInText(text);
  if (pages.length === 0 && folders.length === 0) return text;

  const blocks = await Promise.all([
    ...pages.map((id) => loadPageBlock(id)),
    ...folders.map((id) => loadFolderBlock(id)),
  ]);

  return injectConfluencePrompt(text, blocks);
}

export type ConfluenceChatCard = {
  kind: ConfluenceMentionKind;
  id: string;
  title: string;
  url: string;
  body: string;
};

export function composeConfluenceMessage(
  card: ConfluenceChatCard | undefined,
  text: string,
): string {
  if (!card) return text.trim();

  const lead =
    text.trim() ||
    (card.kind === "folder"
      ? "Analyze this Confluence folder."
      : "Use this Confluence page.");

  return injectConfluencePrompt(lead, [{ title: card.title, body: card.body }]);
}

export function visibleConfluenceSpaces(
  spaces: readonly ConfluenceSpace[],
  hiddenIds: readonly string[],
): ConfluenceSpace[] {
  if (hiddenIds.length === 0) return [...spaces];

  const hidden = new Set(hiddenIds);
  return spaces.filter((space) => !hidden.has(space.id));
}
