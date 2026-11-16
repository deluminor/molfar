import type { NoteComposerCard } from "@/domain/notes/note-card";
import { looksLikeProject } from "@/features/projects/model/recents";
import { newDefaultSession } from "@/features/sessions/model/session";
import { type InboxDeps, leaveOverlayViews, openComposerSession } from "../inbox/inbox-deps";

/** Starts a chat carrying a note, in the note's project when it has one. */
export function addNoteToChat(deps: InboxDeps, card: NoteComposerCard): void {
  if (!card.id) return;
  deps.store.getState().setSearchViewOpen(false);
  leaveOverlayViews(deps);

  const cwd =
    (card.sourceCwd && looksLikeProject(card.sourceCwd) ? card.sourceCwd : undefined) ||
    deps.defaultCwd();
  const title = card.title.trim();
  const session = {
    ...newDefaultSession(cwd, deps.runtimeMode()),
    ...(title ? { title } : {}),
    noteCard: card,
  };
  openComposerSession(deps, session, cwd);
}
