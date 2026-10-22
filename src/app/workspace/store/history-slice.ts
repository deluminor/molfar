import type { SessionSummary } from "@/features/sessions/data/session-store";
import type { StateUpdate } from "./state-update";

export type HistoryState = {
  /** Saved sessions listed for the projects in `loadedProjects`. */
  history: SessionSummary[];
  /** Saved sessions with a linked work item, across projects. */
  storedLinkedSessions: SessionSummary[];
  /**
   * Projects whose rows are already in `history`. This has to be state, not a
   * ref: `sidebarCwd` is derived during render, so the frame that first shows
   * a new project must already know the listing has not arrived yet.
   */
  loadedProjects: ReadonlySet<string>;
  /** Project whose listing failed, so the error cannot leak to another one. */
  historyErrorCwd: string | null;
};

export type HistoryActions = {
  setHistory: (update: StateUpdate<SessionSummary[]>) => void;
  setStoredLinkedSessions: (update: StateUpdate<SessionSummary[]>) => void;
  setLoadedProjects: (update: StateUpdate<ReadonlySet<string>>) => void;
  setHistoryErrorCwd: (update: StateUpdate<string | null>) => void;
};
