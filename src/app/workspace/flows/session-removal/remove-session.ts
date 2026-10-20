import type { Session } from "@/domain/session/session";
import { sessionDisplayTitle } from "@/domain/session/title";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { createSessionRemover } from "@/features/sessions/model/session-removal";
import type { SessionDeleteChoice } from "@/features/sessions/ui/DeleteSessionDialog";
import { confirmCloseTerminals } from "@/features/terminal/model/terminal-close";
import { isFilesystemTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { filesInWorkspaceTabs } from "@/features/workspace/model/tab-files";
import { alertApp } from "@/shared/lib/app-dialog";
import { confirmDiscardUnsaved } from "../../../model/confirm-discard-unsaved";
import type { WorkspaceStore } from "../../store/types";
import type { SessionPersistence } from "../session-history/session-persistence";
import {
  applySessionRemovalChange,
  type SessionRemovalChangeDeps,
} from "../session-history/session-removal-change";
import { findUnusedSessionWorktree } from "../session-history/unused-worktree";

export type RemoveSessionDeps = {
  store: WorkspaceStore;
  sessionsRef: { readonly current: Session[] };
  tabsRef: { readonly current: WorkspaceTab[] };
  activeTabIdRef: { readonly current: string };
  dirtyFilesRef: { readonly current: Set<string> };
  removingSessionIds: { readonly current: Set<string> };
  switchingWorktrees: { readonly current: Map<string, string> };
  /** Only one delete confirmation is open at a time. */
  deleteConfirmationPending: { current: boolean };
  persistence: Pick<SessionPersistence, "dropPending">;
  removalChange: SessionRemovalChangeDeps;
  invalidateLoadedSession(sessionId: string): void;
  sidebarCwd(): string;
  stopSessionForRemoval(sessionId: string): Promise<Session | undefined>;
  removeWorktree(cwd: string, path: string, force: boolean): Promise<void>;
};

type Seed = Session | SessionSummary | undefined;

/** Asks whether to delete the session's now unused worktree too; undefined when cancelled. */
async function confirmDelete(
  deps: RemoveSessionDeps,
  sessionId: string,
  seed: Seed,
): Promise<{ deleteWorktreePath?: string } | undefined> {
  deps.deleteConfirmationPending.current = true;
  const unusedWorktree = await findUnusedSessionWorktree(sessionId, seed, deps.sessionsRef.current);
  if (!unusedWorktree) {
    deps.deleteConfirmationPending.current = false;
    return {};
  }

  const title = seed ? sessionDisplayTitle(seed.title, seed.harness) : "this session";
  const choice = await new Promise<SessionDeleteChoice>((resolve) => {
    deps.store.getState().setSessionDeleteDialog({ title, unusedWorktree, resolve });
  });
  deps.deleteConfirmationPending.current = false;
  if (!choice.confirmed) return undefined;
  return choice.deleteWorktree ? { deleteWorktreePath: unusedWorktree } : {};
}

/** Closing the session's tabs may drop unsaved files or running terminals; the user decides. */
async function confirmClosingTabs(
  deps: RemoveSessionDeps,
  closedTabs: WorkspaceTab[],
  mode: "archive" | "delete",
): Promise<boolean> {
  const files = filesInWorkspaceTabs(closedTabs);
  const unsaved = files.some((file) => isFilesystemTab(file) && deps.dirtyFilesRef.current.has(file.id));
  if (
    unsaved &&
    !(await confirmDiscardUnsaved(
      `${mode === "archive" ? "Archive" : "Delete"} this conversation with unsaved files?`,
    ))
  )
    return false;
  const terminals = files.filter((file) => file.terminal);
  return terminals.length === 0 || (await confirmCloseTerminals(terminals));
}

/**
 * Archives or deletes a session, open or saved, closing its panes. The CLI
 * skips confirmations and gets errors thrown instead of shown.
 */
export async function removeSession(
  deps: RemoveSessionDeps,
  sessionId: string,
  mode: "archive" | "delete",
  skipDeleteConfirm = false,
  origin: "ui" | "cli" = "ui",
): Promise<boolean> {
  if (
    deps.removingSessionIds.current.has(sessionId) ||
    deps.switchingWorktrees.current.has(sessionId) ||
    deps.deleteConfirmationPending.current
  )
    return false;
  const open = deps.sessionsRef.current.find((session) => session.id === sessionId);
  const summary = deps.store.getState().history.find((entry) => entry.id === sessionId);
  const seed: Seed = open ?? summary;
  deps.removingSessionIds.current.add(sessionId);

  let deleteWorktreePath: string | undefined;
  if (mode === "delete" && !skipDeleteConfirm) {
    const confirmed = await confirmDelete(deps, sessionId, seed);
    if (!confirmed) {
      deps.removingSessionIds.current.delete(sessionId);
      return false;
    }
    deleteWorktreePath = confirmed.deleteWorktreePath;
  }

  deps.invalidateLoadedSession(sessionId);
  deps.persistence.dropPending(sessionId);
  try {
    const remover = createSessionRemover({
      mode,
      preserveOpenFiles: origin === "cli",
      scope: "project",
      replacement: {
        harness: seed?.harness ?? "cursor",
        cwd: seed?.cwd ?? deps.sidebarCwd(),
        model: seed?.model,
        runtimeMode: seed?.runtimeMode,
        modelSettings: open?.modelSettings,
      },
      workspace: {
        snapshot: () => ({
          tabs: deps.tabsRef.current,
          sessions: deps.sessionsRef.current,
          activeTabId: deps.activeTabIdRef.current,
          dirtyFiles: deps.dirtyFilesRef.current,
        }),
        apply: (change) => applySessionRemovalChange(deps.removalChange, { sessionId, summary }, change),
      },
      confirm: async (closedTabs, removalMode) =>
        origin === "cli" || confirmClosingTabs(deps, closedTabs, removalMode),
      stop: deps.stopSessionForRemoval,
    });
    const removed = await remover.remove(sessionId);
    if (removed && deleteWorktreePath && seed) {
      try {
        await deps.removeWorktree(seed.cwd, deleteWorktreePath, false);
      } catch (error) {
        void alertApp(
          `The session was deleted. Its worktree was kept.\n\n${String(error)}\n\nYou can manage it in Settings → Worktrees.`,
          { kind: "warning" },
        );
      }
    }
    return removed;
  } catch (error) {
    if (origin === "cli") throw error;
    const detail = error instanceof Error ? error.message : String(error);
    void alertApp(`Could not ${mode} this conversation.\n\n${detail}`, { kind: "error" });
    return false;
  } finally {
    deps.removingSessionIds.current.delete(sessionId);
  }
}
