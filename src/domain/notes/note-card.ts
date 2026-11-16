import type { NoteSource } from "./note-source";

/** Note chip shown in the composer and on the user turn in the thread. */
export type NoteCardMeta = {
  id: string;
  slug: string;
  title: string;
  sourceCwd?: string;
  source?: NoteSource;
};
/** Composer chip: display fields plus the body injected into the harness prompt. */
export type NoteComposerCard = NoteCardMeta & {
  body: string;
  /**
   * Absolute path to attach as a native file instead of inlining `body`.
   * Used for Knowledge vault notes so the agent reads the file on disk.
   */
  filePath?: string;
};

export function noteCardMeta(card: NoteComposerCard): NoteCardMeta {
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    ...(card.sourceCwd ? { sourceCwd: card.sourceCwd } : {}),
    ...(card.source ? { source: card.source } : {}),
  };
}
