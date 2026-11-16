import { useLayoutEffect } from "react";
import type { Session } from "@/domain/session/session";
import { detachFamiliarTabs } from "@/features/familiars/model/familiar-workspace";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { newDefaultSession } from "@/features/sessions/model/session";
import type { WorkspaceStore } from "../../store/types";
import { useWorkspaceActions } from "../use-workspace-actions";
import type { WorkspaceSessions } from "../use-workspace-sessions";

type FamiliarTabMigrationInput = {
  store: WorkspaceStore;
  tabs: WorkspaceTab[];
  sessions: Session[];
  activeTabId: string;
  projectCwd: string;
  tabsRef: { current: WorkspaceTab[] };
  sessionsRef: WorkspaceSessions["sessionsRef"];
  setSessions: WorkspaceSessions["setSessions"];
};

/** Familiars left inside workspace tabs (older layouts) move out before paint; the Familiar a tab showed stays in view. */
export function useFamiliarTabMigration({
  store,
  tabs,
  sessions,
  activeTabId,
  projectCwd,
  tabsRef,
  sessionsRef,
  setSessions,
}: FamiliarTabMigrationInput): void {
  const { setTabs, setActiveTabId, setFamiliarViewId } = useWorkspaceActions(store);

  useLayoutEffect(() => {
    const migration = detachFamiliarTabs(
      tabs,
      sessions,
      activeTabId,
      projectCwd,
      (cwd) => newDefaultSession(cwd),
    );
    if (!migration) return;
    tabsRef.current = migration.tabs;
    sessionsRef.current = [...sessions, ...migration.addedSessions];
    setTabs(migration.tabs);
    setSessions(sessionsRef.current);
    setActiveTabId(migration.activeTabId);
    if (migration.agentViewId) {
      setFamiliarViewId(migration.agentViewId);
    }
  }, [tabs, sessions, activeTabId, projectCwd, tabsRef, sessionsRef, setSessions]);
}
