import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import { createFamiliar } from "@/features/familiars/model/familiar";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import type { WorkspaceStore } from "../../store/types";
import type { FamiliarView } from "./familiar-view";

export type FamiliarActionsDeps = {
  store: WorkspaceStore;
  view: FamiliarView;
  familiarsEnabled(): boolean;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  setSidebarTab(tab: SidebarTabId, project?: string): void;
  selectHistorySession(sessionId: string): Promise<unknown>;
};

/** Toggling, creating and leaving a Familiar for a session it launched, created once for the workspace. */
export function createFamiliarActions(deps: FamiliarActionsDeps) {
  const { view } = deps;

  return {
    toggle: () => view.toggle(deps.familiarsEnabled()),
    /** A new Familiar opens straight away, ready to be told what it works on. */
    create: (projects?: readonly string[]) => {
      const familiarId = createFamiliar(projects).id;
      deps.store.getState().setFamiliarSettingsFor(familiarId);
      void view.open(familiarId);
    },
    openLaunchedInWorkspace: async (sessionId: string): Promise<void> => {
      const session = await deps.ensureOpenSession(sessionId);
      if (!session) throw new Error("This session is no longer available.");
      view.close();
      deps.setSidebarTab("sessions", session.cwd);
      await deps.selectHistorySession(sessionId);
    },
    showLaunchedFromTurn: (familiarSessionId: string, _turnId: string, _blocks: Block[], launchedId: string) =>
      view.showLaunchedSession(familiarSessionId, launchedId),
  };
}
