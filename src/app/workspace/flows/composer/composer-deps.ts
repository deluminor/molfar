import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";
import type { WorkspaceStore } from "../../store/types";
import type { SessionPersistence } from "../session-history/session-persistence";

/** What the composer's model choice and drafts read and write. */
export type ComposerDeps = {
  store: WorkspaceStore;
  sessionsRef: { readonly current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  persistence: Pick<SessionPersistence, "dropPending" | "forgetSaved" | "forgetUserTurn">;
  invalidateLoadedSession(sessionId: string): void;
};
