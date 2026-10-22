import type { ArchiveContext } from "@/features/sessions/model/archive-shortcut";
import type { FamiliarRemovalDeps } from "../familiars/familiar-removal";
import type { HistoryLinkDeps } from "../linked-work-items/history-link";
import type { RemoveSessionDeps } from "../session-removal/remove-session";
import type { SessionActionsDeps } from "./session-actions";

export type SessionHistoryDeps = {
  session: SessionActionsDeps;
  removal: RemoveSessionDeps;
  link: HistoryLinkDeps;
  familiarRemoval: Omit<FamiliarRemovalDeps, "removeSession">;
  setSessionArchived(sessionId: string, archived: boolean): Promise<void>;
  /** Read when the archive key fires: what is focused and whether a surface covers the chat. */
  archiveContext(): ArchiveContext;
};
