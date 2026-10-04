import type { Session } from "@/domain/session/session";
import { releaseOrchestrationWorker } from "@/features/orchestration/model/orchestration-workspace";
import { rememberLoadedSession } from "@/features/sessions/data/session-cache";
import {
  mergeHistorySummary,
  summaryFromSession,
} from "@/features/sessions/data/session-history";
import {
  type SessionSummary,
  shouldPersistSession,
} from "@/features/sessions/data/session-store";
import type { SessionRemovalChange } from "@/features/sessions/model/session-removal";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { filesInWorkspaceTabs } from "@/features/workspace/model/tab-files";
import type { WorkspaceStore } from "../../store/types";
import type { SessionLoader } from "./session-loader";
import type { SessionPersistence } from "./session-persistence";

export type SessionRemovalChangeDeps = {
  store: WorkspaceStore;
  openSessions(): Session[];
  /** Publishes sessions through Workspace's ref and the store. */
  commitSessions(next: Session[]): void;
  /** Publishes tabs through Workspace's ref and the store. */
  commitTabs(next: WorkspaceTab[]): void;
  activeTabId(): string;
  activateTab(tabId: string): void;
  setComposerFocused(focused: boolean): void;
  loader: SessionLoader;
  persistence: SessionPersistence;
  cache: Map<string, Session>;
  refreshHistory(): void;
};

export type RemovalTarget = {
  sessionId: string;
  /** The session's saved row, if the sidebar listed it. */
  summary?: SessionSummary;
};

/** Applies one step of a session removal to the window. */
export function applySessionRemovalChange(
  deps: SessionRemovalChangeDeps,
  target: RemovalTarget,
  change: SessionRemovalChange,
): void {
  if (change.type === "stopped") {
    deps.commitSessions(
      deps
        .openSessions()
        .map((session) =>
          session.id === target.sessionId ? change.session : session,
        ),
    );
    return;
  }

  if (change.type === "orchestrationReleased") {
    releaseWorkers(deps, change.leadId);
    return;
  }

  applyRemoval(deps, target, change);
}

function releaseWorkers(deps: SessionRemovalChangeDeps, leadId: string) {
  deps.commitSessions(
    deps
      .openSessions()
      .map((session) => releaseOrchestrationWorker(session, leadId)),
  );
  for (const [id, cached] of deps.cache) {
    if (releaseOrchestrationWorker(cached, leadId) !== cached) {
      deps.loader.invalidate(id);
    }
  }
  // Pending reads may still carry the deleted lead's ownership.
  for (const id of deps.loader.loadingIds()) deps.loader.invalidate(id);
  deps.persistence.mapPending((pending) =>
    releaseOrchestrationWorker(pending, leadId),
  );

  const releaseSummary = (entry: SessionSummary) =>
    entry.orchestrationLeadId === leadId
      ? { ...entry, orchestrationLeadId: undefined }
      : entry;
  const { setHistory, setStoredLinkedSessions } = deps.store.getState();
  setHistory((current) => current.map(releaseSummary));
  setStoredLinkedSessions((current) => current.map(releaseSummary));
}

function applyRemoval(
  deps: SessionRemovalChangeDeps,
  target: RemovalTarget,
  change: Extract<SessionRemovalChange, { type: "removed" }>,
) {
  const { removal } = change;
  deps.persistence.forgetSaved(target.sessionId);
  deps.persistence.dropPending(target.sessionId);

  const closingFiles = filesInWorkspaceTabs(removal.closedTabs);
  deps.store.getState().setDirtyFiles((current) => {
    const next = new Set(current);
    for (const file of closingFiles) next.delete(file.id);
    return next;
  });
  deps.commitSessions(removal.sessions);
  deps.commitTabs(removal.tabs);
  if (removal.activeTabId !== deps.activeTabId()) {
    deps.activateTab(removal.activeTabId);
  }

  const activeTab = removal.tabs.find((tab) => tab.id === removal.activeTabId);
  deps.setComposerFocused(
    removal.sessions.some((session) => session.id === activeTab?.focusedId),
  );

  const { setHistory } = deps.store.getState();
  if (change.mode === "delete") {
    setHistory((current) =>
      current.filter((entry) => entry.id !== target.sessionId),
    );
    deps.refreshHistory();
    return;
  }

  if (change.session && shouldPersistSession(change.session)) {
    rememberLoadedSession(deps.cache, change.session);
  }
  const archived =
    change.savedSummary ??
    target.summary ??
    (change.session && summaryFromSession(change.session));
  if (archived) {
    setHistory((current) =>
      mergeHistorySummary(current, { ...archived, archived: true }),
    );
  }
}
