import type { Session } from "@/domain/session/session";
import { leafIds, newTab, splitPane, type WorkspaceTab } from "@/features/workspace/model/layout";
import type { PlaceSessionDeps } from "./place-session";

export type OpenBesideDeps = Pick<
  PlaceSessionDeps,
  "store" | "sessionsRef" | "tabsRef" | "setSessions" | "selectTab" | "setComposerFocused"
> & {
  activeTabIdRef: { current: string };
  appendTab(tab: WorkspaceTab, cwd?: string): void;
};

/** Adds `session` split right of its source's pane, or in a new tab when the source has none. */
export function openSessionBeside(
  deps: OpenBesideDeps,
  sourceId: string,
  session: Session,
  cwd: string,
  focusComposer = false,
): void {
  const { setTabs, setProjectTerminalFocused } = deps.store.getState();
  const nextSessions = [...deps.sessionsRef.current, session];
  deps.sessionsRef.current = nextSessions;
  deps.setSessions(nextSessions);

  const tab = deps.tabsRef.current.find((entry) => leafIds(entry.layout).includes(sourceId));
  if (tab) {
    const nextTabs = deps.tabsRef.current.map((entry) =>
      entry.id === tab.id
        ? {
            ...entry,
            layout: splitPane(entry.layout, sourceId, "right", session.id),
            focusedId: session.id,
            diffFocused: false,
          }
        : entry,
    );
    deps.tabsRef.current = nextTabs;
    setTabs(nextTabs);
    if (tab.id !== deps.activeTabIdRef.current) deps.selectTab(tab.id);
  } else {
    const nextTab = newTab(session.id);
    deps.appendTab(nextTab, cwd);
    deps.selectTab(nextTab.id);
  }

  setProjectTerminalFocused(false);
  deps.setComposerFocused(focusComposer);
}
