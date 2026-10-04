import type { ConfluenceMentionRef } from "./types";

const PAGE_MENTION_RE = /(^|\s)@confluence\/page\/([A-Za-z0-9_-]+)/g;
const FOLDER_MENTION_RE = /(^|\s)@confluence\/folder\/([A-Za-z0-9_-]+)/g;

export function confluenceMentionLabel(ref: ConfluenceMentionRef): string {
  return `@confluence/${ref.kind}/${ref.id}`;
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
