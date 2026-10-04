import { useCallback, useState } from "react";
import { requestAddToChat } from "@/features/sessions/model/quote-draft";
import {
  confluenceChildrenCached,
  confluencePage,
} from "@/features/confluence/model/api";
import { isConfluenceFolderLike } from "@/features/confluence/model/kinds";
import { confluenceMentionLabel } from "@/features/confluence/model/mentions";
import {
  composeConfluenceMessage,
  confluenceFolderTocMarkdown,
} from "@/features/confluence/model/prompt";
import type {
  ConfluenceChatCard,
  ConfluenceNode,
  ConfluencePage,
  ConfluenceSpace,
} from "@/features/confluence/model/types";
import { errorText } from "./error-text";
import type { SelectedKind, SetError } from "./types";

type Deps = {
  activeSpace: ConfluenceSpace | undefined;
  page: ConfluencePage | null;
  selectedKind: SelectedKind;
  folderChildren: readonly ConfluenceNode[];
  setError: SetError;
};

export type ConfluenceChatApi = {
  sending: boolean;
  sendNodeToChat: (node: ConfluenceNode) => Promise<void>;
  sendToChat: () => Promise<void>;
  copyMention: () => Promise<void>;
};

function sendCard(card: ConfluenceChatCard): void {
  requestAddToChat(composeConfluenceMessage(card, ""), "plain");
}

export function useConfluenceChat({
  activeSpace,
  page,
  selectedKind,
  folderChildren,
  setError,
}: Deps): ConfluenceChatApi {
  const [sending, setSending] = useState(false);

  const sendNodeToChat = useCallback(
    async (node: ConfluenceNode) => {
      if (sending) return;
      setSending(true);

      try {
        if (isConfluenceFolderLike(node)) {
          const children = await confluenceChildrenCached({
            parentId: node.id,
            spaceId: node.spaceId || activeSpace?.id,
            spaceKey: node.spaceKey || activeSpace?.key,
            parentKind: node.kind,
          });

          sendCard({
            kind: "folder",
            id: node.id,
            title: node.title,
            url: node.url,
            body: confluenceFolderTocMarkdown(node, children),
          });
          return;
        }

        const next = await confluencePage(node.id);
        sendCard({
          kind: "page",
          id: next.id,
          title: next.title,
          url: next.url,
          body: next.body,
        });
      } catch (err) {
        setError(errorText(err));
      } finally {
        setSending(false);
      }
    },
    [activeSpace?.id, activeSpace?.key, sending, setError],
  );

  const sendToChat = useCallback(async () => {
    if (!page || sending) return;
    setSending(true);

    try {
      const folder = selectedKind === "folder";
      const body = folder
        ? confluenceFolderTocMarkdown(
            { title: page.title, url: page.url, id: page.id },
            folderChildren,
          )
        : page.body;

      sendCard({
        kind: folder ? "folder" : "page",
        id: page.id,
        title: page.title,
        url: page.url,
        body,
      });
    } finally {
      setSending(false);
    }
  }, [folderChildren, page, selectedKind, sending]);

  const copyMention = useCallback(async () => {
    if (!page) return;

    const label = confluenceMentionLabel({
      kind: selectedKind === "folder" ? "folder" : "page",
      id: page.id,
      title: page.title,
      url: page.url,
    });

    try {
      await navigator.clipboard.writeText(label);
    } catch (error) {
      console.error("Failed to copy Confluence mention:", { label, error });
    }
  }, [page, selectedKind]);

  return { sending, sendNodeToChat, sendToChat, copyMention };
}
