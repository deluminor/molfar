import { confluencePage, listConfluenceChildren } from "./api";
import { confluenceIdsInText } from "./mentions";
import type { ConfluenceChatCard, ConfluenceNode } from "./types";

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
