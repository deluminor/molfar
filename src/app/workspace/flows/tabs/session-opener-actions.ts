import type { Session } from "@/domain/session/session";
import { type OpenSavedSessionDeps, openSavedSession } from "../session-history/open-saved-session";
import type { PaneDeps } from "./pane-deps";
import { selectHistorySession } from "./select-history-session";
import { focusOpenSession, replaceBlankPaneWithSession, type TabFocusDeps } from "./tab-focus";

/** Opening sessions into the workspace (open tab, blank pane, saved history), created once. */
export function createSessionOpenerActions(deps: { focus: TabFocusDeps; saved: OpenSavedSessionDeps; pane: PaneDeps }) {
  return {
    focusOpen: (sessionId: string) => focusOpenSession(deps.focus, sessionId),
    replaceBlankPane: (session: Session) => replaceBlankPaneWithSession(deps.focus, session),
    ensureOpen: (sessionId: string) => openSavedSession(deps.saved, sessionId),
    selectHistory: (sessionId: string) => selectHistorySession(deps.pane, sessionId),
  };
}

export type SessionOpenerActions = ReturnType<typeof createSessionOpenerActions>;
