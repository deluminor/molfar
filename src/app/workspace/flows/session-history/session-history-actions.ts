import type { LinkedWorkItem } from "@/domain/session/session";
import { leafIds } from "@/features/workspace/model/layout";
import { archiveFocusedSession } from "@/features/sessions/model/archive-shortcut";
import { alertApp, confirmApp } from "@/shared/lib/app-dialog";
import { deleteFamiliar, resetFamiliar } from "../familiars/familiar-removal";
import { setHistorySessionLinkedWorkItem } from "../linked-work-items/history-link";
import { removeSession } from "../session-removal/remove-session";
import { pinSession, renameSession } from "./session-actions";
import type { SessionHistoryDeps } from "./session-history-deps";

type RemoveMode = "archive" | "delete";

/** The rename, pin, archive, delete and link flows of saved and open sessions, created once for the workspace. */
export function createSessionHistoryActions(deps: SessionHistoryDeps) {
  const { removal } = deps;

  const remove = (
    sessionId: string,
    mode: RemoveMode,
    skipDeleteConfirm = false,
    origin: "ui" | "cli" = "ui",
  ) => removeSession(removal, sessionId, mode, skipDeleteConfirm, origin);

  const removeEach = async (sessionIds: readonly string[]): Promise<boolean> => {
    for (const sessionId of sessionIds) {
      if (!(await remove(sessionId, "delete", true))) return false;
    }
    return true;
  };

  const unarchive = async (sessionId: string): Promise<boolean> => {
    if (removal.removingSessionIds.current.has(sessionId)) return false;
    try {
      await deps.setSessionArchived(sessionId, false);
      removal.store
        .getState()
        .setHistory((current) =>
          current.map((entry) => (entry.id === sessionId ? { ...entry, archived: false } : entry)),
        );
      return true;
    } catch (error) {
      void alertApp(`Could not unarchive this conversation.\n\n${String(error)}`, { kind: "error" });
      return false;
    }
  };

  const archive = (sessionId: string, archived: boolean) =>
    archived ? remove(sessionId, "archive") : unarchive(sessionId);

  const archiveMany = async (sessionIds: readonly string[], archived: boolean) => {
    for (const sessionId of sessionIds) {
      if (!(await archive(sessionId, archived))) break;
    }
  };

  const pin = (sessionId: string, pinned: boolean) => pinSession(deps.session, sessionId, pinned);

  const deleteOne = (sessionId: string) => remove(sessionId, "delete");

  const deleteMany = async (sessionIds: readonly string[]) => {
    if (sessionIds.length === 0) return;
    const confirmed = await confirmApp(
      `Delete ${sessionIds.length} selected conversations? This can’t be undone.`,
      { okLabel: "Delete" },
    );
    if (confirmed) await removeEach(sessionIds);
  };

  const sessionIdsInTitleTab = (tabId: string): string[] => {
    const tab = removal.tabsRef.current.find((entry) => entry.id === tabId);
    if (!tab) return [];
    const openSessionIds = new Set(removal.sessionsRef.current.map((session) => session.id));
    return leafIds(tab.layout).filter((id) => openSessionIds.has(id));
  };

  const familiarRemoval = { ...deps.familiarRemoval, removeSession: remove };

  return {
    rename: (sessionId: string, displayTitle: string) =>
      renameSession(deps.session, sessionId, displayTitle),
    remove,
    archive,
    archiveMany,
    archiveFocused: (event: KeyboardEvent) =>
      archiveFocusedSession(event, deps.archiveContext(), (sessionId) => {
        void archive(sessionId, true);
      }),
    pin,
    pinMany: async (sessionIds: readonly string[], pinned: boolean) => {
      await Promise.all(sessionIds.map((sessionId) => pin(sessionId, pinned)));
    },
    setLinkedWorkItem: (sessionId: string, linkedWorkItem: LinkedWorkItem | undefined) =>
      setHistorySessionLinkedWorkItem(deps.link, sessionId, linkedWorkItem),
    delete: deleteOne,
    deleteMany,
    deleteWorktreeSessions: removeEach,
    archiveTitleTab: (tabId: string) => {
      void archiveMany(sessionIdsInTitleTab(tabId), true);
    },
    deleteTitleTab: (tabId: string) => {
      const sessionIds = sessionIdsInTitleTab(tabId);
      if (sessionIds.length === 1) void deleteOne(sessionIds[0]);
      else if (sessionIds.length > 1) void deleteMany(sessionIds);
    },
    resetFamiliar: (sessionId: string) => resetFamiliar(familiarRemoval, sessionId),
    deleteFamiliar: (familiarId: string) => deleteFamiliar(familiarRemoval, familiarId),
  };
}

export type SessionHistoryActions = ReturnType<typeof createSessionHistoryActions>;
