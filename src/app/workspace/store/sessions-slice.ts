import type { Session } from "@/domain/session/session";
import type { StateUpdate } from "./state-update";

export type SessionsState = {
  /** Sessions open in this window, live or parked. */
  sessions: Session[];
};

export type SessionsActions = {
  setSessions: (update: StateUpdate<Session[]>) => void;
};
