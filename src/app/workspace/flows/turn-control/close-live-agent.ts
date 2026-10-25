import type { Session } from "@/domain/session/session";
import { isInFlightSession } from "@/features/sessions/model/in-flight";
import { closeLeaf, leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";
import { confirmApp } from "@/shared/lib/app-dialog";

export type CloseLiveAgentDeps = {
  sessions(): Session[];
  tabs(): WorkspaceTab[];
  /** Keeps the session's card out of the working rail until it runs again. */
  dismiss(sessionId: string): void;
  stop(sessionId: string): unknown;
  closeTab(tabId: string): void;
  persist(session: Session | undefined): void;
  updateTabs(update: (prev: WorkspaceTab[]) => WorkspaceTab[]): void;
};

/** Working-rail X: closes the session's pane; warns and stops first while the turn runs. */
export async function closeLiveAgent(deps: CloseLiveAgentDeps, sessionId: string): Promise<void> {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  const running = session ? isInFlightSession(session) : false;
  if (running) {
    const ok = await confirmApp("This chat is still running. Stop it and close the tab?", {
      kind: "warning",
      okLabel: "Stop & close",
    });
    if (!ok) return;
  }

  deps.dismiss(sessionId);
  if (running) await Promise.resolve(deps.stop(sessionId));

  const tab = deps.tabs().find((entry) => leafIds(entry.layout).includes(sessionId));
  if (!tab) return;

  const nextTab = leafIds(tab.layout).length === 1 ? undefined : closeLeaf(tab, sessionId);
  if (!nextTab) {
    deps.closeTab(tab.id);
    return;
  }

  deps.persist(deps.sessions().find((entry) => entry.id === sessionId));
  deps.updateTabs((prev) =>
    prev.map((entry) =>
      entry.id === tab.id
        ? { ...entry, layout: nextTab.layout, focusedId: nextTab.focusedId }
        : entry,
    ),
  );
}
