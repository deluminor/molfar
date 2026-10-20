import { useEffect } from "react";
import type { NoteComposerCard } from "@/domain/notes/note-card";
import { ADD_NOTE_TO_CHAT_EVENT } from "@/features/notes/notes";

/** Notes ask for a chat through a window event; `add` starts it. */
export function useAddNoteToChat(add: (card: NoteComposerCard) => void): void {
  useEffect(() => {
    const onAdd = (event: Event) => {
      const card = (event as CustomEvent<NoteComposerCard>).detail;
      if (!card?.id) return;
      add(card);
    };
    window.addEventListener(ADD_NOTE_TO_CHAT_EVENT, onAdd);
    return () => window.removeEventListener(ADD_NOTE_TO_CHAT_EVENT, onAdd);
  }, [add]);
}
