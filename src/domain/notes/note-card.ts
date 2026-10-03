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
