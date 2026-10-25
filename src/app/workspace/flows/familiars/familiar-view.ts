import type { Session } from "@/domain/session/session";
import {
  findFamiliar,
  listFamiliars,
  saveOpenFamiliar,
} from "@/features/familiars/model/familiar";
import { ensureFamiliarSession } from "@/features/familiars/model/familiar-workspace";
import { newDefaultSession } from "@/features/sessions/model/session";
import { homeDir } from "@/platform/tauri/fs";
import { shownFamiliarSession } from "../../store/familiars-slice";
import type { WorkspaceStore } from "../../store/types";

export type FamiliarViewDeps = {
  store: WorkspaceStore;
  cancelNavigation(): void;
  closeAutomations(): void;
  /** Keeps the Familiar's title tab open in the inset layout. */
  openFamiliarTab(familiarId: string): void;
  ensureOpenSession(sessionId: string): Promise<Session | null>;
  addSession(session: Session): void;
  /** `retake` also moves the caret back into an already focused composer. */
  focusComposer(options: { retake: boolean }): void;
};

export type FamiliarView = ReturnType<typeof createFamiliarView>;

/**
 * Opens a Familiar's conversation as a view over the workspace tabs. A later
 * open or close supersedes one still loading.
 */
export function createFamiliarView(deps: FamiliarViewDeps) {
  const { store } = deps;
  let request = 0;
  /** The last Familiar opened, which the shortcut brings back. */
  let lastFamiliarId: string | undefined;

  const close = (): void => {
    request += 1;
    saveOpenFamiliar(undefined);
    store.getState().setFamiliarViewId(null);
    store.getState().setFamiliarActivity(null);
  };

  const open = async (familiarId: string): Promise<void> => {
    const state = store.getState();
    state.setFamiliarActivity(null);
    deps.cancelNavigation();
    const current = ++request;
    lastFamiliarId = familiarId;

    const session = await ensureFamiliarSession(familiarId, {
      home: homeDir,
      load: deps.ensureOpenSession,
      create: (path) => newDefaultSession(path),
      add: deps.addSession,
    });
    if (!session || current !== request) return;

    // What the last Familiar had open over its overview is its own; another
    // Familiar opens on its list.
    if (store.getState().familiarViewId !== session.id) {
      state.setFamiliarShownSession(null);
      state.setFamiliarShownSessionFocused(false);
      state.setFamiliarOverviewDocument(null);
    }
    saveOpenFamiliar(familiarId);
    // App views close with the Familiar's arrival, not before the await, so
    // the workspace tab never shows between them.
    state.setSearchViewOpen(false);
    state.setInboxViewOpen(false);
    state.setNotesViewOpen(false);
    deps.closeAutomations();
    state.setFamiliarViewId(session.id);
    deps.openFamiliarTab(familiarId);
    state.setProjectTerminalFocused(false);
    deps.focusComposer({ retake: true });
  };

  /** The shortcut opens the last Familiar, or the first on the rail. */
  const toggle = (familiarsEnabled: boolean): void => {
    if (store.getState().familiarViewId) {
      close();
      deps.focusComposer({ retake: false });
      return;
    }
    if (!familiarsEnabled) return;

    const familiarId =
      (lastFamiliarId && findFamiliar(lastFamiliarId) ? lastFamiliarId : undefined) ??
      listFamiliars()[0]?.id;
    if (familiarId) void open(familiarId);
  };

  /** A reset Familiar shown in full view stays shown on its fresh conversation. */
  const replaceSession = (sessionId: string, freshId: string): void => {
    if (store.getState().familiarViewId !== sessionId) return;
    request += 1;
    store.getState().setFamiliarViewId(freshId);
    deps.focusComposer({ retake: true });
  };

  // A launched session opens over the overview, where it can be followed,
  // answered or stopped without leaving the chat. Back lands on every session
  // the Familiar started; opening the one already shown hides it again.
  const showLaunchedSession = async (
    familiarSessionId: string,
    launchedId: string,
  ): Promise<void> => {
    const state = store.getState();
    if (shownFamiliarSession(state) === launchedId) {
      state.setFamiliarShownSession(null);
      return;
    }

    // Load it first, then switch in one step: the overview goes straight
    // from what it shows to this session, never through the list.
    const session = await deps.ensureOpenSession(launchedId).catch(() => null);
    if (store.getState().familiarViewId !== familiarSessionId) return;
    state.setFamiliarOverviewTab("sessions");
    state.setFamiliarOverviewDocument(null);
    state.setFamiliarOverviewOpen(true);
    // One that is gone leaves the sessions list open, which says so.
    if (!session) {
      state.setFamiliarShownSession(null);
      return;
    }
    state.setFamiliarShownSession(launchedId);
    state.setFamiliarShownSessionFocused(true);
    state.setProjectTerminalFocused(false);
    deps.focusComposer({ retake: false });
  };

  /** A deleted Familiar is no longer the one the shortcut brings back. */
  const forget = (familiarId: string): void => {
    if (lastFamiliarId === familiarId) lastFamiliarId = undefined;
  };

  return { close, open, toggle, replaceSession, showLaunchedSession, forget };
}
