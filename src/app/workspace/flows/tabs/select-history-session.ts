import type { Session } from "@/domain/session/session";
import { familiarForSession } from "@/features/familiars/model/familiar";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { looksLikeProject } from "@/features/projects/model/recents";
import { newTab } from "@/features/workspace/model/layout";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { PaneDeps } from "./pane-deps";

/** A worker opens inside its lead's chat, with the worker inspected. */
async function sessionToShow(deps: PaneDeps, session: Session): Promise<Session | null | undefined> {
  const parentId = session.orchestrationLeadId ?? orchestrator.forSession(session.id)?.leadId;
  if (!parentId || parentId === session.id) return session;
  deps.store.getState().setInspectedWorkerId(session.id);
  return deps.ensureOpenSession(parentId);
}

function placeSession(deps: PaneDeps, session: Session): void {
  if (deps.focusOpenSession(session.id) || deps.replaceBlankPane(session)) return;
  const tab = newTab(session.id);
  deps.appendTab(tab, session.cwd);
  deps.selectTab(tab.id);
  deps.setComposerFocused(true);
}

/**
 * Opens a saved session from the sidebar: its open tab, a blank pane, or a
 * new tab. A Familiar's chat opens the Familiar instead.
 */
export async function selectHistorySession(deps: PaneDeps, sessionId: string): Promise<void> {
  deps.cancelNavigation();
  const opened = await deps.ensureOpenSession(sessionId);
  if (!opened || opened.inboxAsk) return;
  const familiar = familiarForSession(opened.id);
  if (familiar) {
    await deps.openFamiliar(familiar.id);
    return;
  }
  const session = await sessionToShow(deps, opened);
  if (!session) return;

  const { setSearchViewOpen, setSettingsOpen, setInboxViewOpen, setNotesViewOpen, setProjectCwd } =
    deps.store.getState();
  setSearchViewOpen(false);
  setSettingsOpen(false);
  setInboxViewOpen(false);
  setNotesViewOpen(false);
  deps.closeAutomations();
  if (looksLikeProject(session.cwd)) setProjectCwd(normalizeProjectPath(session.cwd));

  const linkedUpdate = deps.linkedUpdates().get(session.id);
  placeSession(deps, session);
  if (linkedUpdate) deps.revealLinkedUpdate(session.id, linkedUpdate);
}
