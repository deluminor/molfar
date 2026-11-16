import type { WorktreeFocus } from "@/features/source-control/model/worktree-focus";
import { type ProjectOpenStep, planProjectOpenRun } from "@/features/projects/model/project-open-run";
import { rememberProject } from "@/features/projects/model/recents";
import { pickFolders } from "@/platform/tauri/fs";
import type { ProjectDeps } from "./project-deps";

type Step<A extends ProjectOpenStep["action"]> = Extract<ProjectOpenStep, { action: A }>;

/** Opens the run's new tabs beside each other, so the folders keep their selection order. */
function createTabs(deps: ProjectDeps, created: Step<"create">[]): void {
  if (created.length === 0) return;
  deps.setSessions((prev) => [...prev, ...created.map((step) => step.session)]);
  deps.store
    .getState()
    .setTabs((prev) =>
      created.reduce((tabs, step) => deps.insertBeside(tabs, step.tab, step.besideTabId, step.path), prev),
    );
}

function focusLast(deps: ProjectDeps, last: ProjectOpenStep): void {
  const { setProjectCwd } = deps.store.getState();
  switch (last.action) {
    case "create":
      setProjectCwd(last.path);
      deps.selectTab(last.tab.id);
      deps.focusComposer();
      break;
    case "activate":
      setProjectCwd(last.path);
      deps.activateTab(last.tabId, last.paneId);
      break;
    case "keep":
      setProjectCwd(last.path);
      break;
    case "reuse-blank":
      // `changeSessionProject` already moved to it.
      break;
  }
}

/**
 * Opens a run of folders from one snapshot. Planning per folder from refs
 * would read state React has not rendered yet, so the whole run is planned
 * first and applied in selection order.
 */
export function openProjects(deps: ProjectDeps, paths: readonly string[]): void {
  const steps = planProjectOpenRun({
    memory: deps.readProjectReturnMemory(),
    tabs: deps.tabsRef.current,
    sessions: deps.sessionsRef.current,
    activeTabId: deps.activeTabIdRef.current,
    paths,
  });
  const last = steps[steps.length - 1];
  if (!last) return;

  // After the early return, not before it. `pickFolders` hands back an
  // empty list when the picker is dismissed, and every path failing
  // `looksLikeProject` comes out the same way — so closing these first
  // meant cancelling a folder picker shut whatever the user had open.
  // Nothing below opens a project without also leaving one of these views.
  const { setSearchViewOpen, setInboxViewOpen, setNotesViewOpen, setRecents } = deps.store.getState();
  setSearchViewOpen(false);
  setInboxViewOpen(false);
  setNotesViewOpen(false);
  deps.closeAutomations();

  // At most one folder can take the blank session, and it keeps the
  // retargeting rules `changeSessionProject` already owns.
  const blank = steps.find((step): step is Step<"reuse-blank"> => step.action === "reuse-blank");
  if (blank) deps.changeSessionProject(blank.sessionId, blank.path);
  createTabs(
    deps,
    steps.filter((step): step is Step<"create"> => step.action === "create"),
  );

  // The folder chosen last ends up focused.
  focusLast(deps, last);
  // Every project opened is remembered, the one chosen last most recently.
  for (const step of steps) setRecents(rememberProject(step.path));
}

export function selectProject(deps: ProjectDeps, path: string): void {
  deps.closeFamiliarView();
  deps.navigation.cancel();
  openProjects(deps, [path]);
  deps.navigation.selectProject(path);
}

/** Several folders can be taken at once; each opens as its own project, the last one focused. */
export async function pickProjects(deps: ProjectDeps): Promise<void> {
  openProjects(deps, await pickFolders());
}

/** Shows the sidebar project's workspace, or one of its worktrees. */
export function selectWorkspace(deps: ProjectDeps, focus?: WorktreeFocus): void {
  deps.closeFamiliarView();
  deps.store.getState().setProjectCwd(deps.sidebarCwd());
  deps.navigation.selectWorkspace(deps.sidebarCwd(), focus);
}
