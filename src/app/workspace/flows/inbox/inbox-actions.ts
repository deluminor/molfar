import type { NoteComposerCard } from "@/domain/notes/note-card";
import type { CiRepairRequest } from "@/features/inbox/model/ci-repair";
import type { InboxItem } from "@/features/inbox/model/github-tasks";
import { addNoteToChat } from "../notes/add-note-to-chat";
import { repairChecks } from "./ci-repair";
import type { InboxDeps } from "./inbox-deps";
import { openInboxSession, startInboxItem } from "./inbox-start";

/** The chats started from inbox items and notes, bound to `deps`, created once for the workspace. */
export function createInboxActions(deps: InboxDeps) {
  return {
    start: (item: InboxItem, body?: string) => startInboxItem(deps, item, body),
    addNoteToChat: (card: NoteComposerCard) => addNoteToChat(deps, card),
    openSession: (sessionId: string) => openInboxSession(deps, sessionId),
    repairChecks: (item: InboxItem, request: CiRepairRequest, sessionId?: string) =>
      repairChecks(deps, item, request, sessionId),
  };
}

export type InboxActions = ReturnType<typeof createInboxActions>;
