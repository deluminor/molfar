import { ADD_NOTE_TO_CHAT_EVENT } from "@/features/notes/notes";
import type { NoteComposerCard } from "@/domain/notes/note-card";
import type { VaultConnection, VaultDocument } from "../vault/types";
import { MAX_KNOWLEDGE_CONTEXT_BYTES } from "./constants";

function vaultFilePath(root: string, path: string): string {
  const base = root.replace(/[/\\]+$/, "");
  const relative = path.replace(/^[/\\]+/, "");
  return `${base}/${relative}`;
}

export function knowledgeContextCard(
  connection: VaultConnection,
  document: VaultDocument,
): NoteComposerCard {
  if (!document.body.trim())
    throw new Error(
      "This note is empty. Add content before sending it to an agent.",
    );
  const size = new TextEncoder().encode(document.body).byteLength;
  if (size > MAX_KNOWLEDGE_CONTEXT_BYTES)
    throw new Error(
      "This note exceeds the 128 KiB context limit. Choose a smaller note.",
    );
  if (!document.revision || !document.path)
    throw new Error("This note has no saved revision.");

  return {
    id: `knowledge:${connection.id}:${document.path}`,
    slug: `${connection.name}/${document.path}`,
    title:
      document.path
        .split("/")
        .pop()
        ?.replace(/\.(?:md|markdown)$/i, "") || document.path,
    // Body kept for chip fallback; the harness receives the vault file instead.
    body: document.body,
    filePath: vaultFilePath(connection.root, document.path),
    source: {
      kind: "knowledge",
      vaultName: connection.name,
      path: document.path,
      revision: document.revision,
    },
  };
}

export function requestKnowledgeContext(
  connection: VaultConnection,
  document: VaultDocument,
): void {
  const card = knowledgeContextCard(connection, document);
  window.dispatchEvent(
    new CustomEvent<NoteComposerCard>(ADD_NOTE_TO_CHAT_EVENT, { detail: card }),
  );
}
